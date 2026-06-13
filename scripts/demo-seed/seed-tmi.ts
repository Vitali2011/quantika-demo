#!/usr/bin/env -S npx tsx
/**
 * seed-tmi.ts — targeted idempotent seed of ~30 tmi rows into market_indices.
 *
 * Mirrors seed-charterers.ts patterns:
 *   - reads frozen_date from demo_seed_meta (fallback: latest market_indices date, then today)
 *   - builds rows via buildTmiRows (deterministic, no Math.random)
 *   - wraps upsertIndex calls in a single db.transaction
 *   - --dry-run: opens readonly, reports existing tmi count + what would be written
 *   - --db: path to target database (default: data/demo-seed.db)
 *   - does NOT touch bhsi/drewry or any other index
 *
 * Usage:
 *   npx tsx scripts/demo-seed/seed-tmi.ts [--db data/demo-seed.db] [--dry-run]
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { upsertIndex } from '@/lib/market/market-indices-repository';
import { buildTmiRows } from './tmi-fixture';

export { buildTmiRows };

function getFrozenDate(db: Database.Database): string {
  // 1. Try demo_seed_meta
  const meta = db
    .prepare(`SELECT frozen_date FROM demo_seed_meta WHERE id=1`)
    .get() as { frozen_date?: string } | undefined;
  if (meta?.frozen_date) return meta.frozen_date;

  // 2. Try latest market_indices date
  const latest = db
    .prepare(`SELECT MAX(index_date) d FROM market_indices`)
    .get() as { d?: string } | undefined;
  if (latest?.d) return latest.d;

  // 3. Fall back to today (UTC)
  return new Date().toISOString().slice(0, 10);
}

/**
 * Seed TMI rows into an explicit db handle.
 * Idempotent: upsertIndex uses ON CONFLICT(index_name,index_date) DO UPDATE.
 * Does NOT touch bhsi/drewry or any other index.
 */
export function seedTmiWithDb(db: Database.Database, count = 30): { upserted: number } {
  const frozenDate = getFrozenDate(db);
  const rows = buildTmiRows(frozenDate, count);

  const run = db.transaction(() => {
    for (const row of rows) {
      upsertIndex(db, row);
    }
    return { upserted: rows.length };
  });

  return run();
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const dbPath = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');

  console.log(`[seed-tmi] db=${dbPath}${dryRun ? ' (DRY RUN — no writes)' : ''}`);

  if (!fs.existsSync(dbPath)) {
    console.error(`[seed-tmi] ERROR: db not found: ${dbPath}`);
    process.exit(1);
  }

  if (dryRun) {
    const db = new Database(dbPath, { readonly: true });
    const existingCount = (
      db.prepare(`SELECT COUNT(*) c FROM market_indices WHERE index_name='tmi'`).get() as { c: number }
    ).c;
    const frozenDate = getFrozenDate(db);
    const rows = buildTmiRows(frozenDate, 30);
    console.log(`[seed-tmi] existing tmi rows: ${existingCount}`);
    console.log(`[seed-tmi] frozen_date: ${frozenDate}`);
    console.log(`[seed-tmi] would write ${rows.length} rows (${rows[0].index_date} → ${rows[rows.length - 1].index_date})`);
    db.close();
    console.log('[seed-tmi] dry run complete — no rows written.');
    return;
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const { upserted } = seedTmiWithDb(db);
  const total = (
    db.prepare(`SELECT COUNT(*) c FROM market_indices WHERE index_name='tmi'`).get() as { c: number }
  ).c;
  db.close();

  console.log(`[seed-tmi] done — upserted ${upserted} tmi row(s), table now ${total}.`);
}

if (require.main === module) {
  main();
}
