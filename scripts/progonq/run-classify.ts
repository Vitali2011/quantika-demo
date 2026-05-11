#!/usr/bin/env -S npx tsx
/**
 * progonq runner for classify endpoint.
 *
 * Runs CLASSIFICATION_SYSTEM_PROMPT against .progonq/corpus/etms-classify/
 * scenarios and saves results to .progonq/results/etms-classify-<round>.json.
 * Resumable: skips scenarios already in results file.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/run-classify.ts [--round R0] [--limit N] [--scenario scenario-001]
 *
 * Env:
 *   CLASSIFY_PROVIDER=gemini (default production)
 *   AI_PROVIDER fallback
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';
import { CLASSIFICATION_SYSTEM_PROMPT } from '@/lib/prompts';

const SCOPE = 'CLASSIFY';
const MAX_BODY_CHARS = 3000;
const REQUEST_DELAY_MS = 300;

const CORPUS_DIR = path.resolve(process.cwd(), '.progonq/corpus/etms-classify');
const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

interface Scenario {
  id: string;
  source_email_id: string;
  category: string;
  input: { subject: string; from: string; date: string; body: string };
  reference_output: Record<string, unknown>;
}

interface RunResult {
  scenario_id: string;
  category: string;
  input: Scenario['input'];
  reference_output: Record<string, unknown>;
  model_output: Record<string, unknown> | null;
  error?: string;
  duration_ms: number;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '\n[truncated]';
}

function extractJson(text: string): unknown {
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = s.search(/[{[]/);
  if (start > 0) s = s.slice(start);
  const opener = s[0];
  if (opener !== '{' && opener !== '[') return JSON.parse(s);
  const closer = opener === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === opener) depth++;
    else if (c === closer && --depth === 0) { end = i; break; }
  }
  return JSON.parse(end > 0 ? s.slice(0, end + 1) : s);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runScenario(scenario: Scenario): Promise<RunResult> {
  const body_preview = truncate(scenario.input.body, MAX_BODY_CHARS);
  const today = new Date().toISOString().split('T')[0];
  const userPrompt = `Today's date: ${today}\n\n${JSON.stringify([{
    id: scenario.source_email_id,
    subject: scenario.input.subject,
    from: scenario.input.from,
    date: scenario.input.date,
    body_preview,
  }])}`;

  const t0 = Date.now();
  let model_output: Record<string, unknown> | null = null;
  let error: string | undefined;

  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    try {
      await sleep(REQUEST_DELAY_MS);
      const text = await callAiText(SCOPE, CLASSIFICATION_SYSTEM_PROMPT, userPrompt, {
        maxTokens: 2048,
        timeoutMs: 60_000,
      });
      const parsed = extractJson(text) as { classifications?: unknown[] };
      model_output = (parsed.classifications?.[0] ?? parsed) as Record<string, unknown>;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= 3) { error = msg; break; }
      const delay = [2000, 10000][attempt - 1] ?? 30000;
      console.error(`  [${scenario.id}] attempt ${attempt} ERR: ${msg.slice(0, 80)} — retry in ${delay / 1000}s`);
      await sleep(delay);
    }
  }

  return {
    scenario_id: scenario.id,
    category: scenario.category,
    input: scenario.input,
    reference_output: scenario.reference_output,
    model_output,
    error,
    duration_ms: Date.now() - t0,
  };
}

async function main() {
  const roundArg = process.argv.indexOf('--round');
  const round = roundArg >= 0 ? process.argv[roundArg + 1] : 'R0';
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
  const scenarioFilter = process.argv.includes('--scenario')
    ? process.argv[process.argv.indexOf('--scenario') + 1]
    : null;

  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `etms-classify-${round}.json`);

  // Load scenarios
  const files = readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const allScenarios: Scenario[] = files.map((f) =>
    JSON.parse(readFileSync(path.join(CORPUS_DIR, f), 'utf-8')),
  );

  let scenarios = isFinite(limit) ? allScenarios.slice(0, limit) : allScenarios;
  if (scenarioFilter) scenarios = scenarios.filter((s) => s.id === scenarioFilter);

  // Resume
  const existing: Map<string, RunResult> = new Map();
  if (existsSync(outPath)) {
    const prev: RunResult[] = JSON.parse(readFileSync(outPath, 'utf-8'));
    for (const r of prev) existing.set(r.scenario_id, r);
  }
  const pending = scenarios.filter((s) => !existing.has(s.id) || existing.get(s.id)?.error);

  console.error(`[run-classify] round=${round} total=${scenarios.length} pending=${pending.length}`);

  let done = 0;
  const results: RunResult[] = [...existing.values()].filter((r) => !r.error);

  for (const scenario of pending) {
    const result = await runScenario(scenario);
    results.push(result);
    done++;
    if (done % 10 === 0 || done === pending.length) {
      writeFileSync(outPath, JSON.stringify(results, null, 2));
      const ok = results.filter((r) => !r.error).length;
      const err = results.filter((r) => r.error).length;
      console.error(`[run-classify] ${done}/${pending.length} done (ok=${ok} err=${err})`);
    }
  }

  writeFileSync(outPath, JSON.stringify(results, null, 2));

  // Summary by progonq category
  const byCat: Record<string, { total: number; match: number; mismatch: number }> = {};
  for (const r of results) {
    if (!byCat[r.category]) byCat[r.category] = { total: 0, match: 0, mismatch: 0 };
    byCat[r.category].total++;
    const refCat = (r.reference_output.category as string | undefined) ?? '';
    const modCat = (r.model_output?.category as string | undefined) ?? '';
    if (refCat === modCat) byCat[r.category].match++;
    else byCat[r.category].mismatch++;
  }

  const total = results.length;
  const match = results.filter((r) => r.reference_output.category === r.model_output?.category).length;
  console.error(`\n[run-classify] DONE round=${round}`);
  console.error(`Overall category match: ${match}/${total} (${((match / total) * 100).toFixed(1)}%)`);
  console.error('By progonq category:', JSON.stringify(byCat, null, 2));
  console.error(`Output: ${outPath}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
