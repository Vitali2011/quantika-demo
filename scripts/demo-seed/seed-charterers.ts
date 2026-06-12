#!/usr/bin/env -S npx tsx
/**
 * seed-charterers.ts — demo-universe charterer credit ratings (audit A.1)
 *
 * Seeds the `charterers` table so resolveChartererTier() (normalized-name
 * lookup, lib/matching/charterer-tier.ts) resolves the charterer names that
 * actually occur in the demo email corpus. Fixture built from a corpus sweep
 * with the shared regex in charterer-extract.ts (2026-06-12):
 *
 *   - "GRAIN TRADER A"  — fixture-recap counterparty in 2 emails → blue-chip
 *                          (anonymized stand-in for a major grain house)
 *   - "GRAIN TRADER B"  — fixture-recap counterparty in 1 email  → second
 *   - "Huaya"           — "Acct: huaya" on the bauxite Abidjan→Dongguan cargo
 *                          (the only charterer attached to a parsed cargo row)
 *                          → weak + require_lc, so CHARTERER_TIER_PENALTY
 *                          (weak=4, lib/sailing/fit-breakdown.ts) is visible
 *                          on the demo board.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/seed-charterers.ts [--db data/demo-seed.db] [--dry-run]
 *
 * Idempotent: deletes previously seeded demo rows (matched by the notes
 * marker), then upserts the fixture — repeated runs converge. Rows added
 * outside this seeder (no marker) are left untouched.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { upsertCharterer, type ChartererRow } from '@/lib/market/charterers-repository';

export const DEMO_NOTES = 'demo-universe rating (audit A.1)';

export const CHARTERER_FIXTURE: Omit<ChartererRow, 'created_at'>[] = [
  {
    id: 'grain-trader-a',
    name: 'GRAIN TRADER A',
    tier: 'blue-chip',
    payment_history: '[]',
    require_lc: 0,
    notes: DEMO_NOTES,
  },
  {
    id: 'grain-trader-b',
    name: 'GRAIN TRADER B',
    tier: 'second',
    payment_history: '[]',
    require_lc: 0,
    notes: DEMO_NOTES,
  },
  {
    id: 'huaya',
    name: 'Huaya',
    tier: 'weak',
    payment_history: JSON.stringify([
      { date: '2026-03-18', status: 'late', notes: 'freight settled 11 days after CP due date' },
    ]),
    require_lc: 1,
    notes: DEMO_NOTES,
  },
];

/**
 * Seed the fixture into an explicit db handle.
 * Idempotent: DELETE demo-marked rows, then upsert (converges on every call).
 */
export function seedCharterersWithDb(db: Database.Database): { deleted: number; inserted: number } {
  const deleted = db.prepare(`DELETE FROM charterers WHERE notes = ?`).run(DEMO_NOTES).changes;
  for (const row of CHARTERER_FIXTURE) {
    upsertCharterer(db, row);
  }
  return { deleted, inserted: CHARTERER_FIXTURE.length };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const dbPath = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');

  console.log(`[seed-charterers] db=${dbPath}${dryRun ? ' (DRY RUN — no writes)' : ''}`);
  console.log(`[seed-charterers] fixture (${CHARTERER_FIXTURE.length} rows):`);
  for (const r of CHARTERER_FIXTURE) {
    console.log(`  - ${r.id} | ${r.name} | tier=${r.tier} | require_lc=${r.require_lc}`);
  }

  if (dryRun) {
    console.log('[seed-charterers] dry run complete — no rows written.');
    return;
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`[seed-charterers] ERROR: db not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const { deleted, inserted } = seedCharterersWithDb(db);
  const count = (db.prepare(`SELECT COUNT(*) c FROM charterers`).get() as { c: number }).c;
  db.close();

  console.log(
    `[seed-charterers] done — cleared ${deleted} old demo row(s), upserted ${inserted}, table now ${count} row(s).`,
  );
}

if (require.main === module) {
  main();
}
