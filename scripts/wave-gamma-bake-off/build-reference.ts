#!/usr/bin/env -S npx tsx
/**
 * Build a Gemini 2.5 Pro self-baseline for Wave γ parsing bake-off Mode A.
 *
 * The original plan was to use gpt-5.5 outputs from `ai_audit` as the Mode A
 * reference, but `ai_audit` doesn't store `response_text` (see corpus.ts
 * header), and the ClipProxy gpt-5.5 quota is exhausted. Instead we pin
 * Gemini 2.5 Pro as the in-house reference: Pro becomes the baseline,
 * Flash + Flash-Lite are the candidates judged against it.
 *
 * Output: scripts/wave-gamma-bake-off/baseline-pro25.json
 *   { [caseId]: { [endpoint]: <parsed JSON output from Pro 2.5> } }
 *
 * Skipped cases: any (case, endpoint) where Pro returned a parseError or
 * modelError. Skips are logged and absent from the output map (Mode B falls
 * through naturally for those entries in the bake-off run).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';

import { loadCorpus, type Endpoint } from './corpus';
import { getEndpointSpec, ENDPOINTS } from './endpoint-specs';
import { runCandidate, MODELS } from './run-candidate';

const PRO = MODELS.find((m) => m.id === 'gemini-2.5-pro');
if (!PRO) throw new Error('gemini-2.5-pro not in MODELS list');

const OUT_PATH = path.join(__dirname, 'baseline-pro25.json');

interface ReferenceMap {
  [caseId: string]: Partial<Record<Endpoint, unknown>>;
}

(async () => {
  const corpus = await loadCorpus();
  console.log(`Loaded ${corpus.length} cases. Building Pro 2.5 reference set…`);

  const baseline: ReferenceMap = {};
  let captured = 0;
  let skipped = 0;
  let totalCost = 0;

  const limit = pLimit(parseInt(process.env.BUILD_REFERENCE_CONCURRENCY ?? '3', 10));
  const tasks: Promise<void>[] = [];

  for (const cse of corpus) {
    for (const endpoint of cse.endpoints) {
      if (!ENDPOINTS.includes(endpoint)) continue;
      tasks.push(
        limit(async () => {
          const spec = getEndpointSpec(endpoint);
          const res = await runCandidate({
            model: PRO,
            systemPrompt: spec.systemPrompt,
            userInput: cse.email,
          });
          totalCost += res.costUsd;
          if (res.modelError || res.parseError || res.outputJson === null) {
            skipped++;
            console.warn(
              `[skip] ${cse.id}/${endpoint}: ${res.modelError ?? res.parseError ?? 'no JSON'}`,
            );
            return;
          }
          if (!baseline[cse.id]) baseline[cse.id] = {};
          baseline[cse.id][endpoint] = res.outputJson;
          captured++;
          process.stdout.write('.');
        }),
      );
    }
  }

  await Promise.all(tasks);
  process.stdout.write('\n');

  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');

  console.log(`\nCaptured ${captured} (case, endpoint) pairs, skipped ${skipped}.`);
  console.log(`Total Pro 2.5 cost: $${totalCost.toFixed(4)}`);
  console.log(`Wrote ${OUT_PATH}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
