#!/usr/bin/env -S npx tsx
/**
 * progonq runner for parse-recap endpoint.
 *
 * Runs FIXTURE_RECAP_PARSER_PROMPT against .progonq/corpus/etms-parse-recap/
 * scenarios and saves results to .progonq/results/etms-parse-recap-<round>.json.
 * Resumable: skips scenarios already in results file.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/run-parse-recap.ts [--round R0] [--limit N] [--scenario scenario-001]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';
import { FIXTURE_RECAP_PARSER_PROMPT } from '@/lib/prompts/parse-recap';
import { PARSE_RECAP_SCHEMA } from '@/lib/schemas';

const SCOPE = 'PARSE_RECAP';
const MAX_BODY_CHARS = 12000;
const REQUEST_DELAY_MS = 400;

const CORPUS_DIR = path.resolve(process.cwd(), '.progonq/corpus/etms-parse-recap');
const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

interface Scenario {
  id: string;
  input: {
    subject?: string;
    from?: string;
    date?: string;
    body: string;
  };
  reference_output: Record<string, unknown>;
}

interface RunResult {
  scenario_id: string;
  duration_ms: number;
  reference_output: Record<string, unknown>;
  model_output: Record<string, unknown> | null;
  error?: string;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
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

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function runScenario(scenario: Scenario): Promise<RunResult> {
  const t0 = Date.now();
  const subject = scenario.input.subject ?? '';
  const from = scenario.input.from ?? '';
  const date = scenario.input.date ?? '';
  const body = truncate(scenario.input.body, MAX_BODY_CHARS);
  const userPrompt = `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${body}`;

  let model_output: Record<string, unknown> | null = null;
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callAiText(SCOPE, FIXTURE_RECAP_PARSER_PROMPT, userPrompt, {
        timeoutMs: 120_000,
        responseSchema: PARSE_RECAP_SCHEMA,
      });
      const parsed = extractJson(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        model_output = parsed as Record<string, unknown>;
        break;
      }
      throw new Error('extracted JSON is not an object');
    } catch (e: unknown) {
      lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 160);
      console.error(`  [${scenario.id}] attempt ${attempt} ERR: ${lastErr} — retry in ${attempt * 2}s`);
      await sleep(attempt * 2_000);
    }
  }

  return {
    scenario_id: scenario.id,
    duration_ms: Date.now() - t0,
    reference_output: scenario.reference_output,
    model_output,
    error: model_output ? undefined : lastErr,
  };
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const roundIdx = process.argv.indexOf('--round');
  const round = roundIdx >= 0 ? process.argv[roundIdx + 1] : 'baseline';
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : Infinity;
  const sidIdx = process.argv.indexOf('--scenario');
  const onlySid = sidIdx >= 0 ? process.argv[sidIdx + 1] : null;

  const outPath = path.join(RESULTS_DIR, `etms-parse-recap-${round}.json`);
  const existing: RunResult[] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf-8')) : [];
  const done = new Set(existing.map(r => r.scenario_id));

  const files = readdirSync(CORPUS_DIR).filter(f => f.endsWith('.json')).sort();
  const results: RunResult[] = [...existing];

  let okCount = existing.filter(r => !r.error).length;
  let errCount = existing.filter(r => r.error).length;
  let count = 0;

  console.error(`[run-parse-recap] round=${round} total=${files.length} pending=${files.length - existing.length}`);

  for (const file of files) {
    if (count >= limit) break;
    const sc = JSON.parse(readFileSync(path.join(CORPUS_DIR, file), 'utf-8')) as Scenario;
    if (onlySid && sc.id !== onlySid) continue;
    if (done.has(sc.id)) continue;
    const r = await runScenario(sc);
    results.push(r);
    if (r.error) errCount++; else okCount++;
    count++;
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    if (count % 1 === 0) console.error(`[run-parse-recap] ${count}/${files.length} done (ok=${okCount} err=${errCount})`);
    await sleep(REQUEST_DELAY_MS);
  }

  console.error(`\n[run-parse-recap] DONE round=${round}`);
  console.error(`Output: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
