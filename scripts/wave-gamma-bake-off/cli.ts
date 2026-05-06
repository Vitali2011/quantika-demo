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
import type { Endpoint } from './corpus';
import { ENDPOINTS } from './endpoint-specs';

(async () => {
  const concurrency = parseInt(process.env.BAKE_OFF_CONCURRENCY ?? '5', 10);
  // Comma-separated allowlist of model ids, e.g.
  //   BAKE_OFF_MODEL_FILTER=gemini-2.5-pro,gemini-2.5-flash,gemini-2.5-flash-lite
  // Useful when some Gemini models 404 in the active Vertex project/region.
  const modelFilterRaw = process.env.BAKE_OFF_MODEL_FILTER;
  const modelFilter = modelFilterRaw
    ? modelFilterRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
  // Comma-separated allowlist of endpoints, e.g.
  //   BAKE_OFF_ENDPOINT_FILTER=parse-vessel
  // Useful for re-running a single endpoint after a prompt tweak.
  const endpointFilterRaw = process.env.BAKE_OFF_ENDPOINT_FILTER;
  const endpointFilter = endpointFilterRaw
    ? (endpointFilterRaw.split(',').map((s) => s.trim()).filter(Boolean) as Endpoint[])
    : undefined;
  if (endpointFilter) {
    const unknown = endpointFilter.filter((e) => !ENDPOINTS.includes(e));
    if (unknown.length > 0) {
      throw new Error(`BAKE_OFF_ENDPOINT_FILTER contains unknown endpoint(s): ${unknown.join(', ')}. Valid: ${ENDPOINTS.join(', ')}`);
    }
  }

  const { records, runId, jsonlPath } = await runBakeOff({
    outDir: '.specs/wave-gamma-vertex/bake-off-results',
    concurrency,
    modelFilter,
    endpointFilter,
  });

  const agg = aggregate(records);

  // Detect Mode A/B per endpoint from records: A iff any record carries A.
  const recordsHasReference: Record<string, boolean> = {};
  for (const r of records) {
    if (!(r.endpoint in recordsHasReference)) recordsHasReference[r.endpoint] = false;
    if (r.judgeMode === 'A') recordsHasReference[r.endpoint] = true;
  }

  const gateMode = (process.env.BAKE_OFF_DECISION_MODE === 'practical') ? 'practical' : 'strict';
  const practicalPassGate = parseFloat(process.env.BAKE_OFF_PRACTICAL_PASS_GATE ?? '0.80');
  const decisions = decide(agg, { recordsHasReference, gateMode, practicalPassGate });
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
