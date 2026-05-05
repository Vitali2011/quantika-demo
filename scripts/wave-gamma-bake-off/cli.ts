#!/usr/bin/env -S npx tsx
/**
 * CLI entry point for the Wave γ parsing bake-off.
 *
 * Usage:
 *   npm run bake-off
 *   BAKE_OFF_LIMIT_CASES=2 BAKE_OFF_CONCURRENCY=3 npm run bake-off
 *
 * Pre-flight env (asserted by sub-callees, not here):
 *   GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_CLOUD_PROJECT, ANTHROPIC_API_KEY
 *
 * This CLI runs the full pipeline and writes a JSONL of records. Aggregation,
 * decision, and report wiring will be added in Task 7 of the plan.
 */

import { runBakeOff } from './orchestrator';

(async () => {
  const concurrency = parseInt(process.env.BAKE_OFF_CONCURRENCY ?? '5', 10);
  const { jsonlPath, records } = await runBakeOff({
    outDir: '.specs/wave-gamma-vertex/bake-off-results',
    concurrency,
  });
  console.log(`\nDone — ${records.length} records -> ${jsonlPath}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
