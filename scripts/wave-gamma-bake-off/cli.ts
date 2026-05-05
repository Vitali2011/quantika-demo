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
 * Pipeline: runBakeOff → aggregate → decide → writeReport.
 * The Mode A/B flag per endpoint is reconstructed from the records' judgeMode
 * field — `A` only if at least one case in that endpoint had a reference.
 */

import path from 'node:path';
import { runBakeOff } from './orchestrator';
import { aggregate } from './aggregate';
import { decide } from './decide';
import { writeReport } from './report';

(async () => {
  const concurrency = parseInt(process.env.BAKE_OFF_CONCURRENCY ?? '5', 10);
  const { records, runId, jsonlPath } = await runBakeOff({
    outDir: '.specs/wave-gamma-vertex/bake-off-results',
    concurrency,
  });

  const agg = aggregate(records);

  // Detect Mode A/B per endpoint from records: A iff any record carries A.
  const recordsHasReference: Record<string, boolean> = {};
  for (const r of records) {
    if (!(r.endpoint in recordsHasReference)) recordsHasReference[r.endpoint] = false;
    if (r.judgeMode === 'A') recordsHasReference[r.endpoint] = true;
  }

  const decisions = decide(agg, { recordsHasReference });
  const reportPath = writeReport({
    runId,
    outDir: path.dirname(jsonlPath),
    agg,
    decisions,
  });

  console.log(`\nDone — ${records.length} records -> ${jsonlPath}`);
  console.log(`Report -> ${reportPath}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
