import type Database from "better-sqlite3";
import { createHash } from "crypto";
import {
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
} from "../governance";
import { parseEuXml } from "./eu-parser";
import type { ParsedEntity } from "./eu-parser";
import { normalizeName } from "./normalize";

// EU URL with optional token from env var (token may rotate)
const EU_BASE_URL =
  "https://webgate.ec.europa.eu/europeaid/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content";
const EU_TOKEN = process.env.EU_SANCTIONS_TOKEN || "";
const EU_URL = EU_TOKEN ? `${EU_BASE_URL}?token=${EU_TOKEN}` : EU_BASE_URL;

export type Fetcher = (url: string) => Promise<string>;

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
    const xml = await fetcher(EU_URL);

    // Guard: empty body should throw
    if (!xml || xml.trim() === "") {
      throw new Error("EU fetch returned empty body (NOT marking as fresh)");
    }

    const entities = parseEuXml(xml);
    const result = upsertEuEntities(db, entities);

    // Content-addressable version for change detection
    const upstreamVersion = `sha256:${createHash("sha256")
      .update(xml)
      .digest("hex")
      .slice(0, 16)}`;

    reportSyncSuccess(db, syncId, {
      rowsChanged: result.added + result.removed + result.updated,
      upstreamVersion,
      metadata: result,
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
  const res = await fetch(url, {
    headers: { "User-Agent": "Quantika-Demo/1.0" },
  });
  if (res.status === 401) {
    throw new Error(
      "EU fetch failed: 401 (check EU_SANCTIONS_TOKEN env var for token rotation)"
    );
  }
  if (!res.ok) throw new Error(`EU fetch failed: ${res.status}`);
  return res.text();
}
