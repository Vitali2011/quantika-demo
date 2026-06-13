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

// qa-smoke F4: marker is shown in the demo UI (list snippet + detail Notes) —
// must read broker-friendly, no internal audit jargon.
export const DEMO_NOTES = 'Demo rating — illustrative credit profile';
// Previous marker (pre-rename) — rows seeded under it must still be cleaned.
export const LEGACY_DEMO_NOTES = 'demo-universe rating (audit A.1)';

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
 *
 * Runs in a single transaction (QA F-001): a mid-run failure can't leave the
 * table with demo rows deleted but not re-inserted. A pre-existing row with
 * the SAME name under a DIFFERENT id (e.g. created via the /charterers UI)
 * is ADOPTED in place — updated to the fixture tier under its original id —
 * instead of crashing on UNIQUE(name).
 */
export function seedCharterersWithDb(
  db: Database.Database,
): { deleted: number; inserted: number; adopted: number } {
  const run = db.transaction(() => {
    const deleted = db
      .prepare(`DELETE FROM charterers WHERE notes IN (?, ?)`)
      .run(DEMO_NOTES, LEGACY_DEMO_NOTES).changes; // qa-smoke F4: also migrate old-marker rows
    let adopted = 0;
    const byName = db.prepare(`SELECT id FROM charterers WHERE name = ?`);
    for (const row of CHARTERER_FIXTURE) {
      const existing = byName.get(row.name) as { id: string } | undefined;
      if (existing && existing.id !== row.id) {
        // Same name, foreign id — keep the existing id (other tables may
        // reference it), align the rating fields with the fixture.
        upsertCharterer(db, { ...row, id: existing.id });
        adopted++;
      } else {
        upsertCharterer(db, row);
      }
    }
    return { deleted, inserted: CHARTERER_FIXTURE.length - adopted, adopted };
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

  console.log(`[seed-charterers] db=${dbPath}${dryRun ? ' (DRY RUN — no writes)' : ''}`);
  console.log(`[seed-charterers] fixture (${CHARTERER_FIXTURE.length} rows):`);
  for (const r of CHARTERER_FIXTURE) {
    console.log(`  - ${r.id} | ${r.name} | tier=${r.tier} | require_lc=${r.require_lc}`);
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`[seed-charterers] ERROR: db not found: ${dbPath}`);
    process.exit(1);
  }

  if (dryRun) {
    // QA F-001: dry run opens the DB read-only and reports what a real run
    // would meet (existing rows, same-name adoptions) instead of exiting blind.
    const db = new Database(dbPath, { readonly: true });
    const existing = db
      .prepare(`SELECT id, name, tier, notes FROM charterers`)
      .all() as Array<{ id: string; name: string; tier: string; notes: string | null }>;
    console.log(`[seed-charterers] existing rows: ${existing.length}`);
    for (const r of existing) {
      console.log(`  · ${r.id} | ${r.name} | tier=${r.tier}${r.notes === DEMO_NOTES || r.notes === LEGACY_DEMO_NOTES ? ' [demo — will be reseeded]' : ''}`);
    }
    for (const row of CHARTERER_FIXTURE) {
      const clash = existing.find((r) => r.name === row.name && r.id !== row.id);
      if (clash) console.log(`  ⚠ name clash: '${row.name}' exists as id=${clash.id} — would be ADOPTED in place`);
    }
    db.close();
    console.log('[seed-charterers] dry run complete — no rows written.');
    return;
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const { deleted, inserted, adopted } = seedCharterersWithDb(db);
  const count = (db.prepare(`SELECT COUNT(*) c FROM charterers`).get() as { c: number }).c;
  db.close();

  console.log(
    `[seed-charterers] done — cleared ${deleted} old demo row(s), upserted ${inserted}, adopted ${adopted} same-name row(s), table now ${count} row(s).`,
  );
}

if (require.main === module) {
  main();
}
