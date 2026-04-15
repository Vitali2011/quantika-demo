import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { SessionData } from './types';
import { SESSION_TTL_MS } from './constants';

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
  const { id: _id, accessToken: _at, createdAt: _ca, ...rest } = session;
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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id         TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        data       TEXT NOT NULL
      )
    `);
  }

  createSession(accessToken: string): string {
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
    ).run(id, accessToken, now, now + SESSION_TTL_MS, serializeData(session));

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
}

// Singleton for application use
let _store: SessionStore | null = null;

export function getStore(): SessionStore {
  if (!_store) {
    _store = new SessionStore();
  }
  return _store;
}
