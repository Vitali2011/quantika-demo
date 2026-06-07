#!/usr/bin/env -S npx tsx
/**
 * preview-ranking-shift.ts — read-only diagnostic script.
 *
 * Shows the founder what changes when ranking shifts from `score` → `fit_percent`:
 *   - Old top-15 by score vs new top-15 by fit_percent (side-by-side markdown table)
 *   - Bucket counts: old (score-based matchLevel) vs new (fit-based matchLevel)
 *
 * Source: reads data/demo-seed.db. Does NOT run analyzePairs, does NOT write anything.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/preview-ranking-shift.ts [--db data/demo-seed.db]
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// ── helpers ──────────────────────────────────────────────────────────────────

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Old match level derived from score (mirrors deriveMatchLevel in match-scoring.ts). */
function deriveMatchLevelFromScore(score: number): 'good' | 'possible' | 'weak' {
  if (score >= 70) return 'good';
  if (score >= 40) return 'possible';
  return 'weak';
}

/** New match level derived from fitPercent (mirrors deriveMatchLevelFromFit in match-scoring.ts). */
function deriveMatchLevelFromFit(fit: number): 'good' | 'possible' | 'weak' {
  if (fit >= 70) return 'good';
  if (fit >= 60) return 'possible';
  return 'weak';
}

/** Truncate a string to maxLen, appending '…' if truncated. */
function trunc(s: string | null | undefined, maxLen: number): string {
  if (!s) return '—';
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/** Format a TCE value for display. */
function fmtTce(v: number | null | undefined): string {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('en-US');
}

// ── main ─────────────────────────────────────────────────────────────────────

interface MatchRow {
  id: number;
  cargo_id: string;
  vessel_id: string;
  score: number;
  fit_percent: number | null;
  tce_usd_per_day: number | null;
  vessel_name: string | null;
  cargo_ref: string | null;
  user_id: string | null;
}

function main() {
  const dbPath = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');

  if (!fs.existsSync(dbPath)) {
    console.warn(`[preview] demo-seed.db not found at ${dbPath}`);
    console.warn('[preview] Run scripts/demo-seed/regenerate-matches.ts first to populate the DB.');
    console.log('\n(no data — run regenerate-matches.ts to populate demo-seed.db)\n');
    process.exit(0);
  }

  const stat = fs.statSync(dbPath);
  if (stat.size === 0) {
    console.warn(`[preview] demo-seed.db is empty (0 bytes) at ${dbPath}`);
    console.warn('[preview] Run scripts/demo-seed/regenerate-matches.ts first to populate the DB.');
    console.log('\n(no data — run regenerate-matches.ts to populate demo-seed.db)\n');
    process.exit(0);
  }

  const db = new Database(dbPath, { readonly: true });

  // Check schema
  const cols = db.prepare('PRAGMA table_info(matches)').all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has('score')) {
    console.warn('[preview] matches table missing `score` column — DB may be uninitialised.');
    db.close();
    process.exit(0);
  }

  const hasFit = colNames.has('fit_percent');
  const hasTce = colNames.has('tce_usd_per_day');
  const hasVesselName = colNames.has('vessel_name');
  const hasCargoRef = colNames.has('cargo_ref');

  // Build SELECT
  const selectCols = [
    'id', 'cargo_id', 'vessel_id', 'score', 'user_id',
    hasFit ? 'fit_percent' : 'NULL AS fit_percent',
    hasTce ? 'tce_usd_per_day' : 'NULL AS tce_usd_per_day',
    hasVesselName ? 'vessel_name' : 'NULL AS vessel_name',
    hasCargoRef ? 'cargo_ref' : 'NULL AS cargo_ref',
  ].join(', ');

  // Only seed buckets: NULL (main), __demo_review__, __demo_insufficient__
  const allMatches = db.prepare(
    `SELECT ${selectCols} FROM matches
     WHERE user_id IS NULL OR user_id IN ('__demo_review__', '__demo_insufficient__')`,
  ).all() as MatchRow[];

  db.close();

  if (allMatches.length === 0) {
    console.warn('[preview] No seed matches found in demo-seed.db.');
    console.warn('[preview] Run scripts/demo-seed/regenerate-matches.ts first to populate the DB.');
    console.log('\n(no data — run regenerate-matches.ts to populate demo-seed.db)\n');
    process.exit(0);
  }

  console.log(`[preview] Loaded ${allMatches.length} seed matches from ${dbPath}`);
  if (!hasFit) {
    console.warn('[preview] `fit_percent` column absent — new top-15 will show "—" for fit values.');
    console.warn('[preview] Re-run regenerate-matches.ts after Task 1-3 to get fit values.');
  }

  // ── Top 15 by score (old ranking) ─────────────────────────────────────────
  const byScore = [...allMatches].sort((a, b) => b.score - a.score).slice(0, 15);

  // ── Top 15 by fit_percent (new ranking) ────────────────────────────────────
  const byFit = hasFit
    ? [...allMatches].sort((a, b) => (b.fit_percent ?? 0) - (a.fit_percent ?? 0)).slice(0, 15)
    : [...byScore]; // fallback: same order if fit absent

  // ── Bucket counts ──────────────────────────────────────────────────────────
  // Old: derive matchLevel from score (which bucket = user_id)
  // New: derive matchLevel from fit_percent (which bucket = user_id + fit-based level)

  // User_id → bucket name
  function bucketName(row: MatchRow): 'main' | 'review' | 'insufficient' {
    if (row.user_id === '__demo_review__') return 'review';
    if (row.user_id === '__demo_insufficient__') return 'insufficient';
    return 'main';
  }

  // Old: count match levels across ALL seed matches (persisted match_level not stored;
  // derive from score using the score-based thresholds)
  const oldCounts = { good: 0, possible: 0, weak: 0 };
  const newCounts = { good: 0, possible: 0, weak: 0 };
  const oldBuckets = { main: 0, review: 0, insufficient: 0 };
  const newBuckets = { main: 0, review: 0, insufficient: 0 };

  for (const m of allMatches) {
    const oldLevel = deriveMatchLevelFromScore(m.score);
    oldCounts[oldLevel]++;

    const fit = m.fit_percent ?? null;
    const newLevel = fit != null ? deriveMatchLevelFromFit(fit) : oldLevel;
    newCounts[newLevel]++;

    // Bucket by user_id sentinel
    const bucket = bucketName(m);
    oldBuckets[bucket]++;
    newBuckets[bucket]++;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  console.log('');
  console.log('# Before/After Ranking Preview');
  console.log('');

  // ── Old Top 15 ─────────────────────────────────────────────────────────────
  console.log('## Old Top 15 (by score)');
  console.log('');
  console.log('| Rank | Cargo | Vessel | Score | Fit% | TCE$/day |');
  console.log('|------|-------|--------|-------|------|----------|');
  for (let i = 0; i < byScore.length; i++) {
    const m = byScore[i];
    const cargo = trunc(m.cargo_ref ?? m.cargo_id, 28);
    const vessel = trunc(m.vessel_name ?? m.vessel_id, 28);
    const fit = m.fit_percent != null ? Math.round(m.fit_percent).toString() : '—';
    const tce = fmtTce(m.tce_usd_per_day);
    console.log(`| ${i + 1} | ${cargo} | ${vessel} | ${m.score} | ${fit} | ${tce} |`);
  }

  console.log('');

  // ── New Top 15 ─────────────────────────────────────────────────────────────
  console.log('## New Top 15 (by fitPercent)');
  console.log('');
  console.log('| Rank | Cargo | Vessel | Score | Fit% | TCE$/day |');
  console.log('|------|-------|--------|-------|------|----------|');
  for (let i = 0; i < byFit.length; i++) {
    const m = byFit[i];
    const cargo = trunc(m.cargo_ref ?? m.cargo_id, 28);
    const vessel = trunc(m.vessel_name ?? m.vessel_id, 28);
    const fit = m.fit_percent != null ? Math.round(m.fit_percent).toString() : '—';
    const tce = fmtTce(m.tce_usd_per_day);
    console.log(`| ${i + 1} | ${cargo} | ${vessel} | ${m.score} | ${fit} | ${tce} |`);
  }

  console.log('');

  // ── Match Level Distribution ────────────────────────────────────────────────
  console.log('## Match Level Distribution (all seed matches)');
  console.log('');
  console.log('| Level | Old (score-based) | New (fit-based) | Delta |');
  console.log('|-------|-------------------|-----------------|-------|');
  for (const level of ['good', 'possible', 'weak'] as const) {
    const o = oldCounts[level];
    const n = newCounts[level];
    const delta = n - o >= 0 ? `+${n - o}` : `${n - o}`;
    console.log(`| ${level} | ${o} | ${n} | ${delta} |`);
  }

  console.log('');

  // ── Bucket Counts ───────────────────────────────────────────────────────────
  // NOTE: Buckets (main/review/insufficient) reflect the STORED user_id sentinel,
  // not matchLevel. They only change when regenerate-matches is re-run with the new
  // fit-based floor. The table below shows current state; rerun regenerate-matches
  // to see the post-re-gen bucket split.
  const mainGoodPossible = allMatches.filter((m) => bucketName(m) === 'main').length;
  const reviewCount = allMatches.filter((m) => bucketName(m) === 'review').length;
  const insufficientCount = allMatches.filter((m) => bucketName(m) === 'insufficient').length;

  // New bucket estimate: recalculate based on fit-based levels across all matches
  // main = good + possible by fit (or by score if fit absent)
  const newMainEst = allMatches.filter((m) => {
    const fit = m.fit_percent ?? null;
    const level = fit != null ? deriveMatchLevelFromFit(fit) : deriveMatchLevelFromScore(m.score);
    return level !== 'weak';
  }).length;
  const newReviewEst = allMatches.filter((m) => {
    const fit = m.fit_percent ?? null;
    const level = fit != null ? deriveMatchLevelFromFit(fit) : deriveMatchLevelFromScore(m.score);
    return level === 'weak';
  }).length;

  console.log('## Bucket Counts');
  console.log('');
  console.log('> Current buckets = stored user_id sentinels (actual regenerate-matches output).');
  console.log('> "New estimate" = projected if re-run with fit-based floor (matchLevel from fit).');
  console.log('');
  console.log('| Bucket | Current (stored) | New estimate (fit-based) |');
  console.log('|--------|-----------------|--------------------------|');
  console.log(`| main (good+possible) | ${mainGoodPossible} | ${newMainEst} |`);
  console.log(`| review (weak) | ${reviewCount} | ${newReviewEst} |`);
  console.log(`| insufficient | ${insufficientCount} | ${insufficientCount} (unchanged) |`);
  console.log('');
  console.log(`Total seed matches: ${allMatches.length}`);
  console.log('');
  console.log('---');
  console.log('NOTE: To get accurate fit_percent values, run regenerate-matches.ts after the');
  console.log('feat/ranking-fitpercent branch changes are in place. This script is read-only.');
}

main();
