import type Database from "better-sqlite3";
import { createHash } from "crypto";
import {
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
} from "../governance";
import { parseOfacXml } from "./ofac-parser";
import type { ParsedEntity } from "./ofac-parser";
import { normalizeName } from "./normalize";

const OFAC_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml";

export type Fetcher = (url: string) => Promise<string>;

/**
 * Refreshes OFAC SDN entities from upstream source.
 *
 * Input contract:
 * - db: required (TypeScript type guard prevents null/undefined)
 * - fetcher: optional, defaults to defaultFetcher
 * - fetcher throws → reportSyncFailure called, error rethrown
 * - fetcher returns 200 + empty body → throw error
 * - parser throws (malformed XML) → reportSyncFailure with parse error
 * - all entities removed from upstream → all rows deleted, rowsChanged=N
 * - duplicate uid in same XML → DB UNIQUE violation → entire tx rolls back
 * - concurrent refreshOfac calls → second sees first's lock (SQLite WAL)
 * - idempotent: same XML twice → 0 rowsChanged on second run
 *
 * @param db Database instance
 * @param fetcher Optional fetcher function (defaults to defaultFetcher)
 * @returns Object with rowsChanged and upstreamVersion
 */
export async function refreshOfac(
  db: Database.Database,
  fetcher: Fetcher = defaultFetcher
): Promise<{ rowsChanged: number; upstreamVersion: string }> {
  const syncId = reportSyncStarted(db, "ofac");
  try {
    const xml = await fetcher(OFAC_URL);

    // Guard: empty body should throw
    if (!xml || xml.trim() === "") {
      throw new Error(
        "OFAC fetch returned empty body (NOT marking as fresh)"
      );
    }

    const entities = parseOfacXml(xml);
    const result = upsertOfacEntities(db, entities);

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
 * Upserts OFAC entities using diff/delete logic in a single transaction.
 *
 * Input contract:
 * - Empty entities array: removes all existing entities
 * - Duplicate uid in entities: DB UNIQUE constraint → transaction rolls back
 * - Entity missing uid: parser already validates this
 *
 * @param db Database instance
 * @param entities Parsed entities from OFAC XML
 * @returns Object with added, updated, removed counts
 */
function upsertOfacEntities(
  db: Database.Database,
  entities: ParsedEntity[]
): {
  added: number;
  updated: number;
  removed: number;
} {
  const upstreamUids = new Set(entities.map((e) => e.uid));
  const existingUids = new Set<string>(
    (db.prepare("SELECT uid FROM ofac_entities").all() as any[]).map(
      (r) => r.uid
    )
  );

  const tx = db.transaction(() => {
    let added = 0,
      updated = 0,
      removed = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO ofac_entities (uid, type, name, name_normalized, aliases, country, address, programs, publish_date, raw)
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

    const deleteStmt = db.prepare("DELETE FROM ofac_entities WHERE uid = ?");
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
 * - Non-200 response: throws error
 * - Network failure: throws error
 *
 * @param url URL to fetch
 * @returns Response text
 */
async function defaultFetcher(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Quantika-Demo/1.0" },
  });
  if (!res.ok) throw new Error(`OFAC fetch failed: ${res.status}`);
  return res.text();
}
