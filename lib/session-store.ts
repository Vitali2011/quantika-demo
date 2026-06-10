import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { SessionData } from './types';
import { SESSION_TTL_MS } from './constants';
import { runMigrations } from './migrations/runner';
import { allMigrations } from './migrations/index';
import { bootstrapKnowledgeSources } from './knowledge/bootstrap';
import { loadMarketCsvFiles } from './market/manual-csv-loader';

export const MAX_SESSIONS = 100;

const DEFAULT_DB_PATH = process.env.SESSIONS_DB_PATH
  ?? path.join(process.cwd(), 'data', 'sessions.db');

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function serializeData(session: SessionData): string {
   
  const { id, accessToken, createdAt, ...rest } = session;
  return JSON.stringify(rest);
}

function deserializeData(raw: string): Omit<SessionData, 'id' | 'accessToken' | 'createdAt'> {
  return JSON.parse(raw) as Omit<SessionData, 'id' | 'accessToken' | 'createdAt'>;
}

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    ensureDir(dbPath);
    this.db = new Database(dbPath);
    // Load sqlite-vec extension BEFORE migrations (required for migration 018 vec0 tables)
    sqliteVec.load(this.db);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    // Enforce FK constraints (SQLite default is OFF). Required for migrations
    // that declare REFERENCES (e.g., 013 knowledge_sync_log → knowledge_sources)
    // to actually reject orphan inserts at runtime.
    this.db.pragma('foreign_keys = ON');
    if (process.env['USE_MIGRATION_RUNNER'] !== 'false') {
      runMigrations(this.db, allMigrations);
      // Idempotent registration of all knowledge sources (OFAC, EU sanctions,
      // distances, JWC, ECA, ...). Must run AFTER migration 013 has created
      // the knowledge_sources table. Preserves runtime status of existing rows.
      bootstrapKnowledgeSources(this.db);
      // Boot-time CSV fallback: seeds market_indices from lib/sample-data/market/
      // if the table is empty. No-op when data already present.
      loadMarketCsvFiles(this.db);
    } else {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id         TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          data       TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS whatsapp_users (
          phone               TEXT PRIMARY KEY,
          session_id          TEXT NOT NULL,
          onboarded_at        TEXT,
          region              TEXT,
          timezone            TEXT,
          locale              TEXT,
          last_digest_sent_at TEXT,
          created_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS deal_id_counter (
          session_id  TEXT PRIMARY KEY,
          last_id     INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS trial_state (
          session_id   TEXT PRIMARY KEY,
          started_at   TEXT NOT NULL,
          ends_at      TEXT NOT NULL,
          activated_at TEXT,
          region       TEXT,
          demo_seeded  INTEGER DEFAULT 0
        );
      `);
    }
  }

  /** Expose the underlying DB for modules that need direct SQL access. */
  getDb(): Database.Database {
    return this.db;
  }

  createSession(accessToken: string, ttlMs: number = SESSION_TTL_MS): string {
    const count = this.getSessionCount();
    if (count >= MAX_SESSIONS) {
      // Evict oldest by created_at
      const evict = this.db.prepare<[], { id: string }>(
        'SELECT id FROM sessions ORDER BY created_at ASC LIMIT 1'
      ).get();
      if (evict) {
        this.db.prepare('DELETE FROM sessions WHERE id = ?').run(evict.id);
      }
    }

    const id = randomUUID();
    const now = Date.now();
    const session: SessionData = {
      id,
      accessToken,
      createdAt: new Date(now),
      emails: [],
      classifications: [],
      processedEmails: [],
      parsedCargos: [],
      parsedVessels: [],
      parsedFixtureRecaps: [],
      matches: [],
      recaps: [],
      commissionSummary: null,
      counterparties: [],
    };

    this.db.prepare(
      'INSERT INTO sessions (id, access_token, created_at, expires_at, data) VALUES (?, ?, ?, ?, ?)'
    ).run(id, accessToken, now, now + ttlMs, serializeData(session));

    return id;
  }

  getSession(id: string): SessionData | null {
    const row = this.db.prepare<[string], {
      id: string; access_token: string; created_at: number; expires_at: number; data: string;
    }>('SELECT * FROM sessions WHERE id = ?').get(id);

    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      return null;
    }

    const rest = deserializeData(row.data);
    return {
      id: row.id,
      accessToken: row.access_token,
      createdAt: new Date(row.created_at),
      ...rest,
    };
  }

  updateSession(id: string, updates: Partial<SessionData>): boolean {
    const existing = this.getSession(id);
    if (!existing) return false;

    const merged: SessionData = { ...existing, ...updates };
    this.db.prepare('UPDATE sessions SET data = ? WHERE id = ?').run(
      serializeData(merged),
      id
    );
    return true;
  }

  /**
   * Partial-update a single field on a session without deserialising and
   * re-serialising the entire blob.  Full-blob `updateSession` remains
   * available for initial saves and bulk updates.
   */
  updateSessionField<K extends keyof SessionData>(
    id: string,
    field: K,
    value: SessionData[K],
  ): boolean {
    const existing = this.getSession(id);
    if (!existing) return false;

    const updated: SessionData = { ...existing, [field]: value };
    this.db.prepare('UPDATE sessions SET data = ? WHERE id = ?').run(
      serializeData(updated),
      id,
    );
    return true;
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  expireOldSessions(): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }

  getSessionCount(): number {
    const row = this.db.prepare<[], { count: number }>(
      'SELECT COUNT(*) as count FROM sessions'
    ).get();
    return row?.count ?? 0;
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Returns cached bunker price for a port+day pair (migration003: bunker_prices table).
   * Returns null when no cache entry exists.
   */
  getBunkerPrice(port: string, day: string): { vlsfo: number; mgo?: number; fetched_at: string } | null {
    const row = this.db.prepare<[string, string], { vlsfo: number; mgo: number | null; fetched_at: string }>(
      'SELECT vlsfo, mgo, fetched_at FROM bunker_prices WHERE port = ? AND day = ?'
    ).get(port, day);
    if (!row) return null;
    return { vlsfo: row.vlsfo, mgo: row.mgo ?? undefined, fetched_at: row.fetched_at };
  }

  upsertBunkerPrice(port: string, day: string, vlsfo: number, mgo: number | null, fetchedAt: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO bunker_prices (port, day, vlsfo, mgo, fetched_at) VALUES (?, ?, ?, ?, ?)'
    ).run(port, day, vlsfo, mgo, fetchedAt);
  }

  /**
   * Returns cached EUA price for a day (migration003: eua_prices table).
   * Returns null when no cache entry exists.
   */
  getEuaPrice(day: string): { price: number; fetched_at: string } | null {
    const row = this.db.prepare<[string], { price: number; fetched_at: string }>(
      'SELECT price, fetched_at FROM eua_prices WHERE day = ?'
    ).get(day);
    return row ?? null;
  }

  upsertEuaPrice(day: string, price: number, fetchedAt: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO eua_prices (day, price, fetched_at) VALUES (?, ?, ?)'
    ).run(day, price, fetchedAt);
  }

  /**
   * Returns cached OpenSanctions response for a query hash (migration005: opensanctions_cache table).
   * Returns null when no cache entry exists or entry is expired (TTL enforced by caller).
   */
  getOpenSanctionsCache(queryHash: string): { response_json: string; fetched_at: number } | null {
    const row = this.db.prepare<[string], { response_json: string; fetched_at: number }>(
      'SELECT response_json, fetched_at FROM opensanctions_cache WHERE query_hash = ?'
    ).get(queryHash);
    return row ?? null;
  }

  setOpenSanctionsCache(queryHash: string, responseJson: string, fetchedAt: number): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO opensanctions_cache (query_hash, response_json, fetched_at) VALUES (?, ?, ?)'
    ).run(queryHash, responseJson, fetchedAt);
  }
}

// Singleton for application use
let _store: SessionStore | null = null;

export function getStore(): SessionStore {
  if (!_store) {
    _store = new SessionStore();
  }
  return _store;
}
