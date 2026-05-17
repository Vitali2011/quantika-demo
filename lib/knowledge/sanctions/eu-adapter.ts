import type Database from "better-sqlite3";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
} from "../governance";
import { parseEuXml } from "./eu-parser";
import type { ParsedEntity } from "./eu-parser";
import { normalizeName } from "./normalize";

// EU Financial Sanctions Files portal — requires a registered token.
// Register at: https://webgate.ec.europa.eu/fsd/fsf (free, institutional use)
// Set EU_SANCTIONS_TOKEN env var with the token you receive by email.
// Without a token the endpoint returns 403; invalid/expired token returns 500.
const EU_BASE_URL =
  "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content";
const EU_TOKEN = process.env.EU_SANCTIONS_TOKEN || "";
const EU_URL = EU_TOKEN ? `${EU_BASE_URL}?token=${EU_TOKEN}` : EU_BASE_URL;

/** Returns the path used for last-known-good XML cache. Injectable via env for tests. */
export function getCachePath(): string {
  return (
    process.env.EU_SANCTIONS_CACHE_PATH ||
    join(process.cwd(), "data", "cache", "eu-sanctions-last-good.xml")
  );
}

/** Saves XML to the last-known-good cache file. Best-effort: logs on failure but never throws. */
export function saveCacheXml(xml: string): void {
  const cachePath = getCachePath();
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, xml, "utf-8");
  } catch (err) {
    console.warn("[EU] Failed to save last-known-good cache:", err);
  }
}

/** Loads the last-known-good cache XML, or null if absent. Never throws. */
export function loadCacheXml(): string | null {
  const cachePath = getCachePath();
  try {
    if (!existsSync(cachePath)) return null;
    return readFileSync(cachePath, "utf-8") || null;
  } catch {
    return null;
  }
}

export type Fetcher = (url: string) => Promise<string>;

/**
 * HTTP error with a status code, distinguishable from generic network errors
 * so withRetry can decide whether to retry (5xx, 429) or fail fast (4xx auth).
 */
export class HttpFetchError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpFetchError";
    this.status = status;
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (attempt: number, err: unknown, nextDelayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

function defaultShouldRetry(err: unknown): boolean {
  if (err instanceof HttpFetchError) {
    return err.status >= 500 || err.status === 429;
  }
  // Non-HTTP errors (network failure, DNS, ECONNRESET, …) are transient.
  return err instanceof Error;
}

/**
 * Retries an async function with exponential backoff.
 * Default: 3 attempts, 1s → 2s, retry on 5xx/429/network, fail fast on 4xx.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !shouldRetry(err)) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      opts.onRetry?.(attempt, err, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Refreshes EU Consolidated Sanctions entities from upstream source.
 *
 * Input contract:
 * - db: required (TypeScript type guard prevents null/undefined)
 * - fetcher: optional, defaults to defaultFetcher
 * - fetcher throws → reportSyncFailure called, error rethrown
 * - fetcher returns 200 + empty body → throw error
 * - fetcher returns 401 → throw with helpful 'check EU_SANCTIONS_TOKEN env'
 * - parser throws (malformed XML) → reportSyncFailure with parse error
 * - all entities removed from upstream → all rows deleted, rowsChanged=N
 * - duplicate uid in same XML → DB UNIQUE violation → entire tx rolls back
 * - concurrent refreshEu calls → second sees first's lock (SQLite WAL)
 * - idempotent: same XML twice → 0 rowsChanged on second run
 * - EU schema version bump → parser tolerant (unknown fields ignored by parseEuXml)
 * - 0 rows in EU response → reportSyncSuccess with rowsChanged=N (deletion of all)
 * - gzip without Content-Encoding → fetch() handles automatically
 *
 * @param db Database instance
 * @param fetcher Optional fetcher function (defaults to defaultFetcher)
 * @returns Object with rowsChanged and upstreamVersion
 */
export async function refreshEu(
  db: Database.Database,
  fetcher: Fetcher = defaultFetcher
): Promise<{ rowsChanged: number; upstreamVersion: string }> {
  const syncId = reportSyncStarted(db, "eu-sanctions");
  try {
    let xml: string;
    let fromCache = false;

    try {
      xml = await fetcher(EU_URL);
    } catch (fetchErr) {
      // On fetch failure, try last-known-good cache before giving up
      const cached = loadCacheXml();
      if (!cached) throw fetchErr;
      console.warn(
        `[EU] Live fetch failed (${(fetchErr as Error).message}), ` +
          "falling back to last-known-good cache"
      );
      xml = cached;
      fromCache = true;
    }

    // Guard: empty body should throw (not cached — a real signal of upstream problem)
    if (!xml || xml.trim() === "") {
      throw new Error("EU fetch returned empty body (NOT marking as fresh)");
    }

    const entities = parseEuXml(xml);
    const result = upsertEuEntities(db, entities);

    // Content-addressable version; cache: prefix signals degraded mode
    const xmlHash = createHash("sha256").update(xml).digest("hex").slice(0, 16);
    const upstreamVersion = fromCache ? `cache:${xmlHash}` : `sha256:${xmlHash}`;

    // Persist cache only on live fetch so stale cache is never overwritten with itself
    if (!fromCache) {
      saveCacheXml(xml);
    }

    reportSyncSuccess(db, syncId, {
      rowsChanged: result.added + result.removed + result.updated,
      upstreamVersion,
      metadata: { ...result, fromCache },
    });

    return {
      rowsChanged: result.added + result.removed + result.updated,
      upstreamVersion,
    };
  } catch (err) {
    reportSyncFailure(db, syncId, err as Error);
    throw err;
  }
}

/**
 * Upserts EU sanctions entities using diff/delete logic in a single transaction.
 *
 * Input contract:
 * - Empty entities array: removes all existing entities
 * - Duplicate uid in entities: DB UNIQUE constraint → transaction rolls back
 * - Entity missing uid: parser already validates this
 *
 * @param db Database instance
 * @param entities Parsed entities from EU XML
 * @returns Object with added, updated, removed counts
 */
function upsertEuEntities(
  db: Database.Database,
  entities: ParsedEntity[]
): {
  added: number;
  updated: number;
  removed: number;
} {
  const upstreamUids = new Set(entities.map((e) => e.uid));
  const existingUids = new Set<string>(
    (db.prepare("SELECT uid FROM eu_sanctions_entities").all() as any[]).map(
      (r) => r.uid
    )
  );

  const tx = db.transaction(() => {
    let added = 0,
      updated = 0,
      removed = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO eu_sanctions_entities (uid, type, name, name_normalized, aliases, country, address, programs, publish_date, raw)
      VALUES (@uid, @type, @name, @name_normalized, @aliases, @country, @address, @programs, @publish_date, @raw)
      ON CONFLICT(uid) DO UPDATE SET
        type = excluded.type,
        name = excluded.name,
        name_normalized = excluded.name_normalized,
        aliases = excluded.aliases,
        country = excluded.country,
        address = excluded.address,
        programs = excluded.programs,
        publish_date = excluded.publish_date,
        raw = excluded.raw,
        fetched_at = CURRENT_TIMESTAMP
      WHERE type != excluded.type
         OR name != excluded.name
         OR name_normalized != excluded.name_normalized
         OR aliases != excluded.aliases
         OR COALESCE(country, '') != COALESCE(excluded.country, '')
         OR COALESCE(address, '') != COALESCE(excluded.address, '')
         OR programs != excluded.programs
         OR COALESCE(publish_date, '') != COALESCE(excluded.publish_date, '')
    `);

    for (const e of entities) {
      const isNew = !existingUids.has(e.uid);
      const result = upsertStmt.run({
        uid: e.uid,
        type: e.type,
        name: e.name,
        name_normalized: normalizeName(e.name),
        aliases: JSON.stringify(e.aliases),
        country: e.country ?? null,
        address: e.address ? JSON.stringify(e.address) : null,
        programs: JSON.stringify(e.programs),
        publish_date: e.publishDate ?? null,
        raw: e.raw ?? null,
      });
      if (isNew) {
        added++;
      } else if (result.changes > 0) {
        updated++;
      }
    }

    const deleteStmt = db.prepare("DELETE FROM eu_sanctions_entities WHERE uid = ?");
    for (const uid of existingUids) {
      if (!upstreamUids.has(uid)) {
        deleteStmt.run(uid);
        removed++;
      }
    }

    return { added, updated, removed };
  });

  return tx();
}

/**
 * Default fetcher implementation using fetch API.
 *
 * Input contract:
 * - 401 response: throws error suggesting EU_SANCTIONS_TOKEN check
 * - Non-200 response: throws error
 * - Network failure: throws error
 * - gzip without Content-Encoding: fetch() decompresses automatically
 *
 * @param url URL to fetch
 * @returns Response text
 */
async function defaultFetcher(url: string): Promise<string> {
  return withRetry(
    async () => {
      const res = await fetch(url, {
        headers: { "User-Agent": "Quantika-Demo/1.0", Accept: "application/xml" },
      });
      if (res.status === 401) {
        throw new HttpFetchError(
          401,
          "EU fetch failed: 401 (token expired — rotate EU_SANCTIONS_TOKEN at webgate.ec.europa.eu/fsd/fsf)"
        );
      }
      if (res.status === 403) {
        const hint = EU_TOKEN
          ? "token rejected — check EU_SANCTIONS_TOKEN for expiry"
          : "token required — register free at webgate.ec.europa.eu/fsd/fsf and set EU_SANCTIONS_TOKEN";
        throw new HttpFetchError(403, `EU fetch failed: 403 (${hint})`);
      }
      if (!res.ok) {
        // EU FSF returns 500 for invalid/expired tokens (server-side bug); include hint
        const hint =
          res.status >= 500 && EU_TOKEN
            ? " — EU FSF may return 5xx for expired tokens; check EU_SANCTIONS_TOKEN"
            : "";
        throw new HttpFetchError(res.status, `EU fetch failed: ${res.status}${hint}`);
      }
      return res.text();
    },
    {
      onRetry: (attempt, err, nextDelayMs) => {
        const status = err instanceof HttpFetchError ? err.status : "network";
        console.warn(
          `[EU] attempt ${attempt} failed (${status}), retrying in ${nextDelayMs}ms`
        );
      },
    }
  );
}
