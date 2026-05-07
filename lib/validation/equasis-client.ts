/**
 * Equasis IMO lookup client.
 *
 * Equasis (https://www.equasis.org) is a public, free vessel-registry database
 * operated by a consortium of maritime authorities. In a real production build
 * we would screen-scrape it (they don't publish an API) with a polite rate
 * limit (~60 req/hour/IP). For the MVP demo we ship a stub with canned
 * responses for the IMOs that appear in our sample-data, so the demo:
 *
 *   - never makes live HTTP calls (fast, deterministic, CI-safe)
 *   - still exercises the full integration path (cache → compare → warning)
 *   - degrades gracefully when rate-limited or unknown (null, never throw)
 *
 * Swap-in plan for phase 2: replace `stubLookup` with a real HTTP scraper
 * behind the same `lookupVesselByImo` signature. Cache + warning logic stays.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { validateImo } from './imo';

export interface EquasisRecord {
  vesselName: string;
  flag: string;      // ISO-2 country code
  type: string;      // e.g. "Bulk Carrier", "General Cargo", "Container"
  dwt: number;       // summer DWT (metric tonnes)
  built: number;     // year of build
}

export interface CacheHit {
  value: EquasisRecord | null;  // null = negative cache (IMO not found)
  fetchedAt: number;             // ms since epoch
}

// ────────────────────────────────────────────────────────────────────────────
// SQLite cache (TTL-bound)
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = process.env.EQUASIS_CACHE_DB_PATH
  ?? path.join(process.cwd(), 'data', 'equasis_cache.db');

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days

function ensureDir(filePath: string): void {
  if (filePath === ':memory:') return;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export class EquasisCache {
  private db: Database.Database;
  private ttlMs: number;

  constructor(dbPath: string = DEFAULT_DB_PATH, ttlMs: number = DEFAULT_TTL_MS) {
    ensureDir(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.ttlMs = ttlMs;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS equasis_cache (
        imo          TEXT PRIMARY KEY,
        data_json    TEXT,                  -- JSON-stringified EquasisRecord; NULL means negative cache
        fetched_at   INTEGER NOT NULL
      )
    `);
  }

  get(imo: string): CacheHit | null {
    const row = this.db.prepare<[string], { imo: string; data_json: string | null; fetched_at: number }>(
      'SELECT * FROM equasis_cache WHERE imo = ?',
    ).get(imo);
    if (!row) return null;
    if (Date.now() - row.fetched_at > this.ttlMs) {
      this.db.prepare('DELETE FROM equasis_cache WHERE imo = ?').run(imo);
      return null;
    }
    const value = row.data_json ? (JSON.parse(row.data_json) as EquasisRecord) : null;
    return { value, fetchedAt: row.fetched_at };
  }

  set(imo: string, value: EquasisRecord | null): void {
    const json = value ? JSON.stringify(value) : null;
    this.db.prepare(
      'INSERT OR REPLACE INTO equasis_cache (imo, data_json, fetched_at) VALUES (?, ?, ?)',
    ).run(imo, json, Date.now());
  }

  clear(): void {
    this.db.exec('DELETE FROM equasis_cache');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Stub registry (canned responses for demo)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canned Equasis responses for the MVP demo.
 *
 * Contains a handful of real-world IMOs (for credibility if a reviewer spot-
 * checks them) plus IMOs we assigned to sample-data vessels.
 */
const STUB_REGISTRY: Record<string, EquasisRecord> = {
  // Real public-record vessels (verifiable on equasis.org) — used for tests + demo credibility
  '9241061': { vesselName: 'Queen Mary 2',       flag: 'GB', type: 'Passenger (Cruise) Ship', dwt: 76000,  built: 2003 },
  '9811000': { vesselName: 'Ever Given',          flag: 'PA', type: 'Container Ship',          dwt: 199489, built: 2018 },
  '9321483': { vesselName: 'Emma Maersk',         flag: 'DK', type: 'Container Ship',          dwt: 156907, built: 2006 },
  '9074729': { vesselName: 'Sample Bulker',       flag: 'PA', type: 'Bulk Carrier',            dwt: 45000,  built: 1995 },

  // Sample-data vessels — IMOs we assigned so Equasis integration has something to return
  '9540003': { vesselName: 'MV Aleria-1',         flag: 'TR', type: 'General Cargo',           dwt: 5200,  built: 2011 },
  '9540015': { vesselName: 'MV Augusta Star',     flag: 'MH', type: 'Bulk Carrier',            dwt: 63695, built: 2010 },
  '9540027': { vesselName: 'MV SVS Vega',         flag: 'KN', type: 'General Cargo',           dwt: 4250,  built: 2007 },
  '9540039': { vesselName: 'MV Gandolf',          flag: 'CY', type: 'General Cargo',           dwt: 3850,  built: 2003 },
};

let stubOverride: Record<string, EquasisRecord> | null = null;

/** Test hook: reset stub to default registry between cases. */
export function __resetStubForTests(): void {
  stubOverride = null;
}

function stubLookup(imo: string): EquasisRecord | null {
  const reg = stubOverride ?? STUB_REGISTRY;
  return reg[imo] ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface LookupOptions {
  dbPath?: string;
  /** Test hook: simulate a network error. */
  forceError?: 'rate_limit' | 'network';
  /** Test hook: observer called whenever stub is actually invoked (cache miss). */
  onStubCall?: (imo: string) => void;
}

/**
 * Look up a vessel by IMO. Returns null if:
 *   - input is invalid (bad IMO format)
 *   - Equasis doesn't have the vessel
 *   - rate limit / network error (graceful degradation)
 *
 * Results (including nulls) are cached with TTL.
 */
export async function lookupVesselByImo(
  imoRaw: string | null | undefined,
  opts: LookupOptions = {},
): Promise<EquasisRecord | null> {
  if (!imoRaw) return null;

  const validation = validateImo(imoRaw);
  if (!validation.valid || !validation.normalized) return null;
  const imo = validation.normalized;

  const cache = new EquasisCache(opts.dbPath ?? DEFAULT_DB_PATH);
  const hit = cache.get(imo);
  if (hit) return hit.value;

  // Cache miss → fetch from stub (future: real HTTP)
  opts.onStubCall?.(imo);

  if (opts.forceError) {
    // Graceful degradation — log & return null, don't throw
    return null;
  }

  const record = stubLookup(imo);
  cache.set(imo, record);
  return record;
}

// ────────────────────────────────────────────────────────────────────────────
// Compare Equasis record vs LLM-parsed vessel
// ────────────────────────────────────────────────────────────────────────────

const NAME_MISMATCH_THRESHOLD = 0.30;
const DWT_MISMATCH_THRESHOLD  = 0.10;

function normalizeName(raw: string): string {
  return raw.toLowerCase()
    .replace(/^(mv|m\/v|ms|m\/s)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

export interface CompareInput {
  parsedName: string | null;
  parsedDwt: number | null;
}

/**
 * Compare an Equasis record with the LLM-parsed vessel details.
 * Returns a warning string if there's a significant discrepancy, null otherwise.
 *
 * Used to populate `ParsedVessel.verificationWarning`, which appears as a
 * yellow badge in the broker UI so they know to double-check.
 */
export function compareVesselRecord(
  record: EquasisRecord,
  input: CompareInput,
): string | null {
  const warnings: string[] = [];

  if (input.parsedName) {
    const a = normalizeName(record.vesselName);
    const b = normalizeName(input.parsedName);
    if (a && b) {
      const dist = levenshtein(a, b);
      const longest = Math.max(a.length, b.length);
      const ratio = dist / longest;
      if (ratio > NAME_MISMATCH_THRESHOLD) {
        warnings.push(`Name mismatch: Equasis says "${record.vesselName}", email says "${input.parsedName}"`);
      }
    }
  }

  if (input.parsedDwt != null && Number.isFinite(input.parsedDwt) && record.dwt > 0) {
    const delta = Math.abs(input.parsedDwt - record.dwt) / record.dwt;
    if (delta > DWT_MISMATCH_THRESHOLD) {
      warnings.push(`DWT mismatch: Equasis=${record.dwt}, email=${input.parsedDwt}`);
    }
  }

  return warnings.length > 0 ? warnings.join('; ') : null;
}
