#!/usr/bin/env -S npx tsx
/**
 * progonq runner for draft-quote endpoint.
 *
 * Reads scenarios from .progonq/corpus/etms-draft-quote/, calls callAiText
 * directly (bypasses HTTP/session), saves raw outputs to
 * .progonq/results/etms-draft-quote-<round>.json.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/run-draft-quote.ts [--round R0] [--scenario etms-draft-quote-001]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';
import { DRAFT_QUOTE_SYSTEM_PROMPT } from '@/lib/prompts';
import type { ExpectedCriteria, RunResult } from './judge-draft-quote';

const SCOPE = 'DRAFT_QUOTE';
const REQUEST_DELAY_MS = 1200;

const CORPUS_DIR = path.resolve(process.cwd(), '.progonq/corpus/etms-draft-quote');
const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

// ─── Scenario shape ───────────────────────────────────────────────────────────

interface DraftQuoteScenario {
  id: string;
  source: string;
  category: string;
  input: {
    cargo: Record<string, unknown>;
    vessel: Record<string, unknown> | null;
    freight_rate_usd_per_mt: number | null;
    lumpsum_usd: number | null;
    extra_clauses: string | null;
    broker_name: string;
    language: 'en' | 'ar';
  };
  expected: ExpectedCriteria;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildUserPrompt(sc: DraftQuoteScenario): string {
  const { cargo, vessel, freight_rate_usd_per_mt, lumpsum_usd, broker_name, language, extra_clauses } =
    sc.input;

  const rateLine =
    freight_rate_usd_per_mt !== null && freight_rate_usd_per_mt !== undefined
      ? `Freight rate: ${freight_rate_usd_per_mt} USD/MT`
      : lumpsum_usd !== null && lumpsum_usd !== undefined
        ? `Lump sum freight: USD ${lumpsum_usd.toLocaleString('en-US')}`
        : '';

  const commercialParts = [rateLine, extra_clauses ? `Additional clauses: ${extra_clauses}` : ''].filter(
    Boolean,
  );

  const langInstruction = language === 'ar' ? '\nPlease write the email in Arabic.' : '';

  return [
    'Cargo inquiry data:',
    JSON.stringify(cargo, null, 2),
    vessel ? `\nRecommended vessel:\n${JSON.stringify(vessel, null, 2)}` : '',
    commercialParts.length > 0 ? `\nCommercial terms:\n${commercialParts.join('\n')}` : '',
    '',
    `Address the reply to: ${broker_name}`,
    '',
    `Generate a professional draft quote email.${langInstruction}`,
  ]
    .filter(s => s !== null)
    .join('\n');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runScenario(sc: DraftQuoteScenario): Promise<RunResult> {
  const t0 = Date.now();
  const userPrompt = buildUserPrompt(sc);

  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const rawText = await callAiText(SCOPE, DRAFT_QUOTE_SYSTEM_PROMPT, userPrompt, {
        timeoutMs: 90_000,
      });
      return {
        scenario_id: sc.id,
        category: sc.category,
        language: sc.input.language,
        duration_ms: Date.now() - t0,
        raw_text: rawText,
        expected: sc.expected,
      };
    } catch (e: unknown) {
      lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      console.error(
        `  [${sc.id}] attempt ${attempt} ERR: ${lastErr} — retry in ${attempt * 2}s`,
      );
      await sleep(attempt * 2_000);
    }
  }

  return {
    scenario_id: sc.id,
    category: sc.category,
    language: sc.input.language,
    duration_ms: Date.now() - t0,
    raw_text: '',
    expected: sc.expected,
    error: `ai_error after 3 attempts: ${lastErr}`,
  };
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const roundIdx = process.argv.indexOf('--round');
  const round = roundIdx >= 0 ? process.argv[roundIdx + 1] : 'R0';
  const sidIdx = process.argv.indexOf('--scenario');
  const onlySid = sidIdx >= 0 ? process.argv[sidIdx + 1] : null;

  const outPath = path.join(RESULTS_DIR, `etms-draft-quote-${round}.json`);
  const existing: RunResult[] = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, 'utf-8'))
    : [];
  const done = new Set(existing.map(r => r.scenario_id));
  const results: RunResult[] = [...existing];

  const files = readdirSync(CORPUS_DIR)
    .filter(f => f.startsWith('scenario-') && f.endsWith('.json'))
    .sort();

  let okCount = existing.filter(r => !r.error).length;
  let errCount = existing.filter(r => r.error).length;
  let count = 0;

  console.error(
    `[run-draft-quote] round=${round} total=${files.length} pending=${files.length - existing.length}`,
  );

  for (const file of files) {
    const sc = JSON.parse(
      readFileSync(path.join(CORPUS_DIR, file), 'utf-8'),
    ) as DraftQuoteScenario;
    if (onlySid && sc.id !== onlySid) continue;
    if (done.has(sc.id)) continue;

    const r = await runScenario(sc);
    results.push(r);
    if (r.error) errCount++;
    else okCount++;
    count++;

    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.error(
      `[run-draft-quote] ${count}/${files.length - existing.length} [${sc.id}] ${r.error ? 'ERR: ' + r.error : 'ok'} (${r.duration_ms}ms)`,
    );
    await sleep(REQUEST_DELAY_MS);
  }

  console.error(`\n[run-draft-quote] DONE round=${round} ok=${okCount} err=${errCount}`);
  console.error(`Output: ${outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
