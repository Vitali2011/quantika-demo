#!/usr/bin/env tsx
/**
 * Seed script: populates roi_metrics with 18 synthetic fixture rows
 * (3 cohort_months × 6 voyages) for γ-18 ROI_GUARANTEE activation.
 *
 * Idempotent: ON CONFLICT DO UPDATE SET — re-runs overwrite existing rows (full upsert).
 * Deterministic: seeded LCG — re-runs produce identical rows.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-roi-metrics.ts
 *   npx tsx --env-file=.env.local scripts/seed-roi-metrics.ts --dry-run
 */

import { getStore } from '@/lib/session-store';
import { upsertRoiMetrics } from '@/lib/analytics/roi-metrics';

// ---------------------------------------------------------------------------
// Deterministic seeded LCG (Numerical Recipes, multiplier=1664525)
// ---------------------------------------------------------------------------
function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randInt(rng: () => number, lo: number, hi: number): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

function randFloat(rng: () => number, lo: number, hi: number): number {
  return rng() * (hi - lo) + lo;
}

// ---------------------------------------------------------------------------
// Vessel types with corresponding freight / TCE baseline bands
// ---------------------------------------------------------------------------
const VESSEL_TYPES = [
  { name: 'handysize', freightLo: 800_000,   freightHi: 1_200_000, tceDay: 12_000 },
  { name: 'supramax',  freightLo: 1_200_000, freightHi: 1_800_000, tceDay: 18_000 },
  { name: 'panamax',   freightLo: 1_500_000, freightHi: 2_500_000, tceDay: 24_000 },
];

// ---------------------------------------------------------------------------
// Build fixture rows
// ---------------------------------------------------------------------------
interface FixtureRow {
  id: string;
  voyage_id: string;
  deal_date: string;
  cohort_month: string;
  freight_usd: number;
  bunker_cost_usd: number;
  demurrage_usd: number;
  despatch_usd: number;
  tce_actual_usd: number;
  tce_baseline_usd: number;
}

function buildFixtures(): FixtureRow[] {
  const rng = makePrng(0xdead_beef);
  const cohorts = ['2026-03', '2026-04', '2026-05'];
  const rows: FixtureRow[] = [];

  for (const cohort of cohorts) {
    const [year, month] = cohort.split('-').map(Number);
    // Days in month (no leap edge case needed for Mar/Apr/May)
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let v = 1; v <= 6; v++) {
      // Random vessel selection per voyage
      const actualVesselIdx = randInt(rng, 0, 2);
      const av = VESSEL_TYPES[actualVesselIdx];

      const voyageId = `V-${cohort.replace('-', 'M')}-${String(v).padStart(3, '0')}`;
      const id = `roi-${voyageId}`;

      // Deal date: random day within the cohort month
      const day = randInt(rng, 1, daysInMonth);
      const deal_date = `${cohort}-${String(day).padStart(2, '0')}`;

      const freight_usd = Math.round(randFloat(rng, av.freightLo, av.freightHi));
      const bunkerPct = randFloat(rng, 0.30, 0.45);
      const bunker_cost_usd = Math.round(freight_usd * bunkerPct);

      // 50% clean (demurrage=0, despatch>0), 50% delayed (demurrage>0, despatch=0)
      const isClean = rng() < 0.5;
      const demurrage_usd = isClean ? 0 : Math.round(randFloat(rng, 0, 150_000));
      const despatch_usd  = isClean ? Math.round(randFloat(rng, 0, 50_000)) : 0;

      // TCE baseline: market rate × voyage days (15-35)
      const voyageDays = randInt(rng, 15, 35);
      const tce_baseline_usd = Math.round(av.tceDay * voyageDays);

      // TCE actual: 65% wins (+up to 15%), 35% losses (-up to 15%)
      const isWin = rng() < 0.65;
      const pctMove = randFloat(rng, 0, 0.15);
      const tce_actual_usd = Math.round(
        tce_baseline_usd * (isWin ? 1 + pctMove : 1 - pctMove)
      );

      rows.push({
        id,
        voyage_id: voyageId,
        deal_date,
        cohort_month: cohort,
        freight_usd,
        bunker_cost_usd,
        demurrage_usd,
        despatch_usd,
        tce_actual_usd,
        tce_baseline_usd,
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function seed(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const prefix = dryRun ? '[DRY RUN] ' : '';

  const fixtures = buildFixtures();

  // Realism check
  const avgSavings =
    fixtures.reduce((sum, r) => sum + (r.tce_actual_usd - r.tce_baseline_usd), 0) /
    fixtures.length;
  const minSavings = Math.min(...fixtures.map((r) => r.tce_actual_usd - r.tce_baseline_usd));
  const maxSavings = Math.max(...fixtures.map((r) => r.tce_actual_usd - r.tce_baseline_usd));

  console.log(`${prefix}ROI metrics fixture: ${fixtures.length} rows`);
  console.log(
    `${prefix}savings_usd preview — min: ${Math.round(minSavings)}, max: ${Math.round(maxSavings)}, avg: ${Math.round(avgSavings)}`
  );

  if (dryRun) {
    for (const row of fixtures) {
      const savings = row.tce_actual_usd - row.tce_baseline_usd;
      console.log(
        `  [DRY] ${row.voyage_id}  cohort=${row.cohort_month}  savings=${Math.round(savings)}`
      );
    }
    return;
  }

  const db = getStore().getDb();

  for (const row of fixtures) {
    upsertRoiMetrics(db, row);
  }

  console.log(`Inserted/updated ${fixtures.length} rows into roi_metrics.`);

  // Cohort summary
  const summary = db
    .prepare(
      `SELECT cohort_month, COUNT(*) as cnt, ROUND(AVG(savings_usd)) as avg_savings
       FROM roi_metrics GROUP BY cohort_month ORDER BY cohort_month`
    )
    .all() as Array<{ cohort_month: string; cnt: number; avg_savings: number }>;

  console.log('\ncohort_month | count | avg_savings_usd');
  for (const r of summary) {
    console.log(`  ${r.cohort_month}  |   ${r.cnt}   | ${r.avg_savings}`);
  }
}

seed().catch((err) => {
  console.error('roi-metrics seed failed:', err);
  process.exit(1);
});
