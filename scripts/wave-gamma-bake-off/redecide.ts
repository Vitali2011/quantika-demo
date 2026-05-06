#!/usr/bin/env -S npx tsx
/**
 * Re-decide CLI for the Wave γ parsing bake-off.
 *
 * Reads an existing records.jsonl from a previous run, re-runs aggregate +
 * decide + writeReport without making any API calls. Use to retroactively
 * apply different gate settings (e.g. practical-gate) to historical data.
 *
 * Usage:
 *   npx tsx scripts/wave-gamma-bake-off/redecide.ts <path/to/records.jsonl>
 *
 * Env (same semantics as cli.ts):
 *   BAKE_OFF_DECISION_MODE      "strict" (default) | "practical"
 *   BAKE_OFF_PRACTICAL_PASS_GATE  default "0.80"
 *
 * Output: writes report-{runId}-{gateMode}.md next to the JSONL.
 */

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import type { BakeOffRecord } from './orchestrator';
import { aggregate } from './aggregate';
import { decide } from './decide';
import { writeReport } from './report';

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: redecide.ts <path/to/records.jsonl>');
    process.exit(1);
  }
  const jsonlPath = path.resolve(arg);
  if (!existsSync(jsonlPath)) {
    console.error(`File not found: ${jsonlPath}`);
    process.exit(1);
  }

  const raw = readFileSync(jsonlPath, 'utf8');
  const records: BakeOffRecord[] = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as BakeOffRecord);

  if (records.length === 0) {
    console.error('No records found in JSONL.');
    process.exit(1);
  }

  const runId = records[0].runId ?? path.basename(path.dirname(jsonlPath));
  const outDir = path.dirname(jsonlPath);

  const agg = aggregate(records);

  const recordsHasReference: Record<string, boolean> = {};
  for (const r of records) {
    if (!(r.endpoint in recordsHasReference)) recordsHasReference[r.endpoint] = false;
    if (r.judgeMode === 'A') recordsHasReference[r.endpoint] = true;
  }

  const gateMode = (process.env.BAKE_OFF_DECISION_MODE === 'practical') ? 'practical' : 'strict';
  const practicalPassGate = parseFloat(process.env.BAKE_OFF_PRACTICAL_PASS_GATE ?? '0.80');

  const decisions = decide(agg, { recordsHasReference, gateMode, practicalPassGate });

  // writeReport writes to report-{runId}.md; rename to include gateMode suffix.
  const writtenPath = writeReport({ runId, outDir, agg, decisions });
  const finalPath = path.join(outDir, `report-${runId}-${gateMode}.md`);
  if (writtenPath !== finalPath) {
    if (existsSync(finalPath)) unlinkSync(finalPath);
    renameSync(writtenPath, finalPath);
  }

  console.log(`Records: ${records.length}`);
  console.log(`Gate mode: ${gateMode} (practicalPassGate=${practicalPassGate})`);
  console.log(`Report -> ${finalPath}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
