#!/usr/bin/env tsx
/**
 * Unfreeze demo market data (Lane C).
 *
 * Re-runs the EXISTING market/bunker/EUA cron scripts against the demo seed DB,
 * writing fresh scraped prices over the frozen static-seed snapshot. Adds NO
 * scraping logic — it only points SESSIONS_DB_PATH at the seed and rolls up
 * per-source success/failure.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/unfreeze-market.ts [--db data/demo-seed.db]
 *
 * After this runs, the freight refresh shifts TCE → re-run
 * scripts/demo-seed/regenerate-matches.ts (orchestrator owns the combined regen).
 */
import * as path from 'path';
import { spawnSync } from 'child_process';

export function resolveTargetDb(argv: string[]): string {
  const i = argv.indexOf('--db');
  const raw = i === -1 ? 'data/demo-seed.db' : argv[i + 1];
  const resolved = path.resolve(raw);
  if (resolved.endsWith(path.sep + 'sessions.db')) {
    throw new Error('refuse: will not unfreeze into sessions.db (live sessions). Use data/demo-seed.db.');
  }
  return resolved;
}

export const CRON_STEPS: ReadonlyArray<{ label: string; script: string }> = [
  { label: 'baltic', script: 'scripts/knowledge/cron/refresh-market-indices.ts' },
  { label: 'bunker', script: 'scripts/knowledge/cron/refresh-bunker.ts' },
  { label: 'eua',    script: 'scripts/knowledge/cron/refresh-eua.ts' },
];

export function runUnfreeze(targetDb: string): { label: string; ok: boolean }[] {
  const env = { ...process.env, SESSIONS_DB_PATH: targetDb };
  return CRON_STEPS.map(({ label, script }) => {
    console.log(`\n[unfreeze] ▶ ${label}: ${script} → ${targetDb}`);
    const r = spawnSync('npx', ['tsx', script], { stdio: 'inherit', env });
    const ok = r.status === 0;
    console.log(`[unfreeze] ${ok ? '✓' : '✗'} ${label} (exit ${r.status})`);
    return { label, ok };
  });
}

if (require.main === module) {
  const targetDb = resolveTargetDb(process.argv.slice(2));
  const results = runUnfreeze(targetDb);
  const failed = results.filter((r) => !r.ok).map((r) => r.label);
  console.log('\n[unfreeze] summary:', results.map((r) => `${r.label}=${r.ok ? 'ok' : 'FAIL'}`).join(' '));
  if (failed.length) {
    console.warn(`[unfreeze] ⚠ down mirror(s): ${failed.join(', ')} — fresh prices NOT written for these. Re-run later or note in handoff.`);
  }
  // Exit 0 if at least one source refreshed (partial unfreeze still useful);
  // exit 1 only if ALL failed (nothing fresh written).
  process.exit(results.some((r) => r.ok) ? 0 : 1);
}
