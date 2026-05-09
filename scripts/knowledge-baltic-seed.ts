#!/usr/bin/env tsx
/**
 * Baltic Dry Indices seed script — populates baltic_indices table.
 *
 * Seeds static reference values for BDI/BCI/BSI/BHSI.
 * Real-time data integration can be added later; this provides
 * a baseline so governance shows the source as "fresh".
 *
 * Usage:
 *   npm run knowledge:baltic
 *   npm run knowledge:baltic -- --dry-run
 */

import * as path from 'path';
import { getDb } from '../lib/db';
import { runMigrations } from '../lib/migrations/runner';
import { allMigrations } from '../lib/migrations/index';

export interface BalticRow {
  index_code: string;
  value: number;
  price_date: string;
  source: string;
}

/** Approximate Baltic indices as of 2026-05 (static seed) */
export const STATIC_INDICES: BalticRow[] = [
  { index_code: 'BDI', value: 1450, price_date: '2026-05-09', source: 'static-seed' },
  { index_code: 'BCI', value: 1600, price_date: '2026-05-09', source: 'static-seed' },
  { index_code: 'BSI', value: 1100, price_date: '2026-05-09', source: 'static-seed' },
  { index_code: 'BHSI', value: 650, price_date: '2026-05-09', source: 'static-seed' },
];

export function upsertBalticRows(
  db: import('better-sqlite3').Database,
  rows: BalticRow[]
): number {
  const stmt = db.prepare<[string, number, string, string]>(`
    INSERT OR IGNORE INTO baltic_indices (index_code, value, price_date, source)
    VALUES (?, ?, ?, ?)
  `);

  const upsertMany = db.transaction((batch: BalticRow[]) => {
    for (const row of batch) {
      stmt.run(row.index_code, row.value, row.price_date, row.source);
    }
  });

  upsertMany(rows);
  return rows.length;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('[DRY RUN] Would insert:');
    for (const r of STATIC_INDICES) {
      console.log(`  ${r.index_code}: ${r.value} (${r.price_date})`);
    }
    console.log('[DRY RUN] Skipping DB upsert.');
    return;
  }

  const dbPath =
    process.env['SESSIONS_DB_PATH'] ??
    path.join(process.cwd(), 'data', 'sessions.db');

  const db = getDb(dbPath);
  runMigrations(db, allMigrations);

  const count = upsertBalticRows(db, STATIC_INDICES);
  console.log(`[baltic-seed] Inserted ${count} rows into baltic_indices.`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[baltic-seed] Error:', err);
    process.exit(1);
  });
}
