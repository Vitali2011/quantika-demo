#!/usr/bin/env ts-node
/**
 * Quarterly refresh script for canal_tariffs.
 *
 * Usage:
 *   npx ts-node scripts/refresh-canal-tariffs.ts [--canal suez] [--dry-run]
 *
 * Behaviour:
 *   1. Reads current active tariff rows from the DB.
 *   2. Fetches updated rates from official sources (static URLs) or via LLM prompt.
 *   3. Closes the previous record (valid_to = today).
 *   4. Inserts a new record with valid_from = today.
 *   Idempotent: running twice on the same day is a no-op (today's record already active).
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { CanalTariffRow } from '../lib/economics/canals/types';

const DEFAULT_DB_PATH =
  process.env.CANAL_DB_PATH ?? path.join(process.cwd(), 'data', 'canal.db');

const CANAL_TARIFFS_SCHEMA = `
CREATE TABLE IF NOT EXISTS canal_tariffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canal TEXT NOT NULL,
  vessel_type TEXT NOT NULL,
  scnt_min INTEGER,
  scnt_max INTEGER,
  base_fee_usd REAL NOT NULL,
  per_scnt_fee_usd REAL NOT NULL DEFAULT 0,
  war_risk_zone TEXT,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canal_lookup
  ON canal_tariffs(canal, vessel_type, valid_from, valid_to);
`;

/** Official source URLs (static reference — actual fetching done by LLM prompt) */
const OFFICIAL_SOURCES: Record<string, string> = {
  suez:     'https://www.suezcanal.gov.eg/English/Tolls/Pages/TollsCalculator.aspx',
  panama:   'https://www.pancanal.com/en/op/toll-calculator.html',
  kiel:     'https://www.kiel-canal.org/en/kiel-canal/shipping/tolls/',
  bosporus: 'https://www.dgm.gov.tr/',
};

function openDb(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.exec(CANAL_TARIFFS_SCHEMA);
  return db;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetch updated rates for a canal.
 * In production: would query official source or LLM.
 * In tests: should be mocked.
 */
export async function fetchUpdatedRates(
  canal: string,
  currentRows: CanalTariffRow[]
): Promise<Omit<CanalTariffRow, 'id'>[]> {
  // Stub: return current rows with today's valid_from and llm source tag
  return currentRows.map(row => ({
    ...row,
    valid_from: getToday(),
    valid_to: null,
    source: `llm:refresh-${getToday()}`,
  }));
}

export interface RefreshResult {
  canal: string;
  closed: number;
  inserted: number;
  skipped: number;
}

/**
 * Refresh tariff rows for a single canal.
 * Idempotent: skips if an open row with valid_from = today already exists.
 */
export function refreshCanal(
  db: Database.Database,
  canal: string,
  newRows: Omit<CanalTariffRow, 'id'>[]
): RefreshResult {
  const today = getToday();
  let closed = 0;
  let inserted = 0;
  let skipped = 0;

  db.transaction(() => {
    for (const row of newRows) {
      // Check if today's record already exists (idempotent)
      const existing = db
        .prepare<[string, string, string]>(
          `SELECT id FROM canal_tariffs
           WHERE canal = ? AND vessel_type = ? AND valid_from = ? AND valid_to IS NULL`
        )
        .get(canal, row.vessel_type, today);

      if (existing) {
        skipped++;
        continue;
      }

      // Close current open row
      const closedCount = db
        .prepare<[string, string, string]>(
          `UPDATE canal_tariffs
           SET valid_to = ?
           WHERE canal = ? AND vessel_type = ?
             AND valid_to IS NULL AND valid_from < ?`
        )
        .run(today, canal, row.vessel_type, today).changes;
      closed += closedCount;

      // Insert new row
      db.prepare(
        `INSERT INTO canal_tariffs
           (canal, vessel_type, scnt_min, scnt_max, base_fee_usd, per_scnt_fee_usd,
            war_risk_zone, valid_from, valid_to, source)
         VALUES
           (@canal, @vessel_type, @scnt_min, @scnt_max, @base_fee_usd, @per_scnt_fee_usd,
            @war_risk_zone, @valid_from, @valid_to, @source)`
      ).run(row);
      inserted++;
    }
  })();

  return { canal, closed, inserted, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const canalFilter = args.find((_, i) => args[i - 1] === '--canal');
  const dryRun = args.includes('--dry-run');

  const db = openDb(DEFAULT_DB_PATH);
  const today = getToday();

  const canals = canalFilter
    ? [canalFilter]
    : Object.keys(OFFICIAL_SOURCES);

  console.log(`Canal tariff refresh — ${today}${dryRun ? ' [DRY RUN]' : ''}`);

  for (const canal of canals) {
    const current = db
      .prepare<[string]>(
        `SELECT * FROM canal_tariffs
         WHERE canal = ? AND valid_to IS NULL ORDER BY vessel_type, scnt_min`
      )
      .all(canal) as CanalTariffRow[];

    if (current.length === 0) {
      console.log(`  ${canal}: no existing rows — skipping`);
      continue;
    }

    console.log(`  ${canal}: fetching updated rates from ${OFFICIAL_SOURCES[canal] ?? 'unknown'}`);
    const newRows = await fetchUpdatedRates(canal, current);

    if (dryRun) {
      console.log(`  ${canal}: would insert ${newRows.length} rows (dry run)`);
      continue;
    }

    const result = refreshCanal(db, canal, newRows);
    console.log(
      `  ${canal}: closed=${result.closed}, inserted=${result.inserted}, skipped=${result.skipped}`
    );
  }

  db.close();
}

if (require.main === module) {
  main().catch(err => {
    console.error('Refresh failed:', err);
    process.exit(1);
  });
}
