#!/usr/bin/env -S npx tsx
/**
 * progonq runner for classify endpoint.
 *
 * Runs CLASSIFICATION_SYSTEM_PROMPT against .progonq/corpus/etms-classify/
 * scenarios and saves results to .progonq/results/etms-classify-<round>.json.
 * Each scenario is classified individually (batch=1) to keep per-scenario
 * accountability and remain compatible with the existing per-scenario cache.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/run-classify.ts [--round R0] [--limit N]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callAiJson } from '@/lib/ai-provider';
import { CLASSIFICATION_SYSTEM_PROMPT, CLASSIFICATION_SYSTEM_PROMPT_R4 } from '@/lib/prompts';
import { CLASSIFY_SCHEMA } from '@/lib/schemas';
import { normalizeRef, daysMatch, normalizeCompanyName } from '@/lib/email-normalize';

const SCOPE = 'CLASSIFY';
const MAX_BODY_CHARS = 3000;
const REQUEST_DELAY_MS = 300;

const CORPUS_DIR = path.resolve(process.cwd(), '.progonq/corpus/etms-classify');
const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

export interface AiClassification {
  id: string;
  category: string;
  urgency: string;
  confidence: number;
  is_unanswered: boolean;
  days_without_reply: number | null;
  original_sender?: string | null;
  original_sender_company?: string | null;
}

interface Scenario {
  id: string;
  source_email_id: string;
  category: string;
  input: { subject: string; from: string; date: string; body: string };
  reference_output: AiClassification;
}

export interface ClassifyMatch {
  category_match: boolean;
  urgency_match: boolean;
  is_unanswered_match: boolean;
  ref_category: string;
  model_category: string | null;
  ref_urgency: string;
  model_urgency: string | null;
  ref_is_unanswered: boolean;
  model_is_unanswered: boolean | null;
  ref_company: string | null;
  model_company: string | null;
  ref_sender: string | null;
  model_sender: string | null;
}

export interface NormalizedMatch {
  category_match: boolean;
  urgency_match: boolean;
  is_unanswered_match: boolean;
  days_match: boolean;
  company_name_match: boolean;
  ref_urgency_normalized: string;
  ref_days_normalized: number | null;
}

interface RunResult {
  scenario_id: string;
  category: string;
  input: Scenario['input'];
  reference_output: AiClassification;
  model_output: AiClassification | null;
  error?: string;
  duration_ms: number;
  match: ClassifyMatch;
  normalized_match?: NormalizedMatch;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '\n[truncated]';
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function ciEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function scoreClassification(ref: AiClassification, model: AiClassification | null): ClassifyMatch {
  return {
    category_match: model !== null && ref.category === model.category,
    urgency_match: model !== null && ciEqual(ref.urgency, model.urgency),
    is_unanswered_match: model !== null && ref.is_unanswered === model.is_unanswered,
    ref_category: ref.category,
    model_category: model?.category ?? null,
    ref_urgency: ref.urgency,
    model_urgency: model?.urgency ?? null,
    ref_is_unanswered: ref.is_unanswered,
    model_is_unanswered: model?.is_unanswered ?? null,
    ref_company: ref.original_sender_company ?? null,
    model_company: model?.original_sender_company ?? null,
    ref_sender: ref.original_sender ?? null,
    model_sender: model?.original_sender ?? null,
  };
}

export function scoreNormalized(
  ref: AiClassification,
  model: AiClassification | null,
  emailDateIso: string,
): NormalizedMatch {
  const norm = normalizeRef(ref, emailDateIso);
  const modelCompanyNorm = normalizeCompanyName(model?.original_sender_company ?? null);
  return {
    category_match: model !== null && norm.category === model.category,
    urgency_match: model !== null && ciEqual(norm.urgency, model.urgency),
    is_unanswered_match: model !== null && norm.is_unanswered === model.is_unanswered,
    days_match: daysMatch(norm.days_without_reply, model?.days_without_reply ?? null),
    company_name_match:
      norm.original_sender_company === null && modelCompanyNorm === null
        ? true
        : norm.original_sender_company !== null &&
          modelCompanyNorm !== null &&
          norm.original_sender_company === modelCompanyNorm,
    ref_urgency_normalized: norm.urgency,
    ref_days_normalized: norm.days_without_reply,
  };
}

let ACTIVE_SYSTEM_PROMPT = CLASSIFICATION_SYSTEM_PROMPT;

async function classifyOne(scenario: Scenario): Promise<AiClassification | null> {
  const body = truncate(scenario.input.body, MAX_BODY_CHARS);
  const emailInput = [{
    id: scenario.source_email_id,
    subject: scenario.input.subject,
    from: scenario.input.from,
    date: scenario.input.date,
    body_preview: body,
  }];
  const todayIso = new Date().toISOString().split('T')[0];
  const userPrompt = `Today's date: ${todayIso}\n\n${JSON.stringify(emailInput)}`;

  const result = await callAiJson<{ classifications: AiClassification[] }>(
    SCOPE,
    ACTIVE_SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 4000,
      timeoutMs: 90_000,
      temperature: 0,
      seed: 42,
      responseSchema: CLASSIFY_SCHEMA as Record<string, unknown>,
    },
  );
  const list = result?.classifications;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[0];
}

async function runScenario(scenario: Scenario): Promise<RunResult> {
  const t0 = Date.now();
  let model: AiClassification | null = null;
  let error: string | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await sleep(REQUEST_DELAY_MS);
      model = await classifyOne(scenario);
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
    model_output: model,
    error,
    duration_ms: Date.now() - t0,
    match: scoreClassification(scenario.reference_output, model),
    normalized_match: scoreNormalized(scenario.reference_output, model, scenario.input.date),
  };
}

async function main() {
  const roundArg = process.argv.indexOf('--round');
  const round = roundArg >= 0 ? process.argv[roundArg + 1] : 'R0';
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
  const outArg = process.argv.indexOf('--output');
  const useR4 = process.argv.includes('--r4') || process.env.EMAIL_PARSE_R4_ENABLED === 'true';

  if (useR4) {
    ACTIVE_SYSTEM_PROMPT = CLASSIFICATION_SYSTEM_PROMPT_R4;
    console.error('[run-classify] Using R4 improved prompt (EMAIL_PARSE_R4_ENABLED)');
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = outArg >= 0
    ? path.resolve(process.argv[outArg + 1])
    : path.join(RESULTS_DIR, `etms-classify-${round}.json`);

  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json')).sort();
  const allScenarios: Scenario[] = files.map((f) =>
    JSON.parse(readFileSync(path.join(CORPUS_DIR, f), 'utf-8')),
  );
  const scenarios = isFinite(limit) ? allScenarios.slice(0, limit) : allScenarios;

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
      const catOk = results.filter((r) => !r.error && r.match.category_match).length;
      console.error(`[run-classify] ${done}/${pending.length} done (ok=${ok} err=${err} cat_ok=${catOk})`);
    }
  }

  writeFileSync(outPath, JSON.stringify(results, null, 2));

  const total = results.length;
  const noErr = results.filter((r) => !r.error);
  const catOk = noErr.filter((r) => r.match.category_match).length;
  const urgOk = noErr.filter((r) => r.match.urgency_match).length;
  const unsOk = noErr.filter((r) => r.match.is_unanswered_match).length;
  const errors = total - noErr.length;

  // Normalized accuracy (removes GT staleness from urgency + days)
  const normCatOk = noErr.filter((r) => r.normalized_match?.category_match).length;
  const normUrgOk = noErr.filter((r) => r.normalized_match?.urgency_match).length;
  const normUnsOk = noErr.filter((r) => r.normalized_match?.is_unanswered_match).length;
  const normDaysOk = noErr.filter((r) => r.normalized_match?.days_match).length;
  const normCompanyOk = noErr.filter((r) => r.normalized_match?.company_name_match).length;

  console.error(`\n[run-classify] DONE round=${round}`);
  console.error('--- Raw (exact GT) ---');
  console.error(`Category accuracy:     ${catOk}/${total} (${((catOk / total) * 100).toFixed(1)}%)`);
  console.error(`Urgency accuracy:      ${urgOk}/${total} (${((urgOk / total) * 100).toFixed(1)}%)`);
  console.error(`is_unanswered match:   ${unsOk}/${total} (${((unsOk / total) * 100).toFixed(1)}%)`);
  console.error(`Errors:                ${errors}`);
  console.error('--- Normalized (GT staleness corrected) ---');
  console.error(`Category accuracy:     ${normCatOk}/${total} (${((normCatOk / total) * 100).toFixed(1)}%)`);
  console.error(`Urgency accuracy:      ${normUrgOk}/${total} (${((normUrgOk / total) * 100).toFixed(1)}%)`);
  console.error(`is_unanswered match:   ${normUnsOk}/${total} (${((normUnsOk / total) * 100).toFixed(1)}%)`);
  console.error(`Days ±10d tolerance:   ${normDaysOk}/${total} (${((normDaysOk / total) * 100).toFixed(1)}%)`);
  console.error(`Company name match:    ${normCompanyOk}/${total} (${((normCompanyOk / total) * 100).toFixed(1)}%)`);
  console.error(`Output: ${outPath}`);

  // Confusion matrix for category
  const confusion: Record<string, Record<string, number>> = {};
  for (const r of noErr) {
    const ref = r.match.ref_category;
    const got = r.match.model_category ?? 'NULL';
    confusion[ref] ??= {};
    confusion[ref][got] = (confusion[ref][got] ?? 0) + 1;
  }
  console.error('\nConfusion matrix (ref → model):');
  for (const ref of Object.keys(confusion).sort()) {
    console.error(`  ${ref}:`, JSON.stringify(confusion[ref]));
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
