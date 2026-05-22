#!/usr/bin/env -S npx tsx
/**
 * progonq runner for parse-vessel endpoint.
 *
 * Runs VESSEL_POSITION_PARSER_PROMPT against .progonq/corpus/etms-parse-vessel/
 * scenarios and saves results to .progonq/results/etms-parse-vessel-<round>.json.
 * Resumable: skips scenarios already in results file.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/run-parse-vessel.ts [--round R0] [--limit N] [--scenario scenario-001]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';
import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts';
import { PARSE_VESSEL_SCHEMA } from '@/lib/schemas';

const SCOPE = 'PARSE_VESSEL';
const MAX_BODY_CHARS = 8000;
const REQUEST_DELAY_MS = 400;

const CORPUS_DIR = path.resolve(process.cwd(), '.progonq/corpus/etms-parse-vessel');
const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

interface ConfidenceField {
  value: unknown;
  confidence?: string;
  source_text?: string;
}

interface VesselItem {
  vessel_name?: ConfidenceField | null;
  imo?: string | null;
  flag?: ConfidenceField | string | null;
  built?: ConfidenceField | number | null;
  dwt_summer?: ConfidenceField | null;
  dwcc?: ConfidenceField | null;
  open_position?: ConfidenceField | null;
  open_date?: ConfidenceField | null;
  [key: string]: unknown;
}

interface ParsedOutput {
  items: VesselItem[];
}

interface Scenario {
  id: string;
  source_email_id: string;
  category: string;
  input: { subject: string; from: string; date: string; body: string };
  reference_output: ParsedOutput;
}

export interface VesselMatchResult {
  ref_vessel_name: string | null;
  model_vessel_name: string | null;
  ref_imo: string | null;
  model_imo: string | null;
  ref_flag: string | null;
  model_flag: string | null;
  ref_built: number | null;
  model_built: number | null;
  ref_dwt: number | null;
  model_dwt: number | null;
  ref_dwcc: number | null;
  model_dwcc: number | null;
  ref_open_position: string | null;
  model_open_position: string | null;
  ref_open_date: string | null;
  model_open_date: string | null;
  vessel_name_match: boolean;          // deterministic (case-insensitive string match)
  imo_match: boolean;
  flag_match: boolean;
  built_match: boolean;
  dwt_match: boolean;
  dwcc_match: boolean;
  string_field_match_rate: number;     // deterministic-fields aggregate
}

interface RunResult {
  scenario_id: string;
  category: string;
  input: Scenario['input'];
  reference_output: ParsedOutput;
  model_output: ParsedOutput | null;
  error?: string;
  duration_ms: number;
  item_count_ref: number;
  item_count_model: number;
  item_matches: VesselMatchResult[];
  match_rate: number;
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

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function getFieldValue(field: unknown): unknown {
  if (field == null) return null;
  if (typeof field === 'object' && 'value' in (field as Record<string, unknown>)) {
    return (field as { value: unknown }).value ?? null;
  }
  return field;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    // open_date appears as { open, close, display } — prefer display, else open
    const obj = v as Record<string, unknown>;
    if (typeof obj.display === 'string') return obj.display;
    if (typeof obj.open === 'string') {
      const close = typeof obj.close === 'string' ? obj.close : '';
      return close ? `${obj.open} → ${close}` : obj.open;
    }
    return JSON.stringify(v);
  }
  return String(v);
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function withinTolerance(ref: number | null, model: number | null, tolerance = 0.05): boolean {
  if (ref === null) return true;   // unannotated ref — don't penalize model
  if (model === null) return false;
  if (ref === 0) return model === 0;
  return Math.abs(ref - model) / Math.abs(ref) <= tolerance;
}

function ciEqual(a: string | null, b: string | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function normalizeVesselName(s: string | null): string | null {
  if (!s) return s;
  return s
    .toUpperCase()
    .replace(/^(M[\s./]*V[.\s/]*|MS[.\s]*|SS[.\s]*|MT[.\s]*)/i, '')
    .replace(/\s*\(EX[\s-][^)]+\)/gi, '')
    .replace(/\s*['"'‘’“”]{1,2}\s*EX\s+[^'"'‘’“”]+['"'‘’“”]{1,2}/gi, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeFlag(s: string | null): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\bst\.?\s+/g, 'saint ')   // St. / St → Saint
    .replace(/\s*&\s*/g, ' and ')        // & → and
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeImo(s: string | null): string | null {
  if (!s) return s;
  const m = s.match(/\d+/);
  return m ? m[0] : null;
}

export function scoreVesselItems(refItems: VesselItem[], modelItems: VesselItem[]): VesselMatchResult[] {
  const results: VesselMatchResult[] = [];
  const used = new Set<number>();

  function findBestMatch(refName: string, items: VesselItem[]): number {
    for (let j = 0; j < items.length; j++) {
      if (used.has(j)) continue;
      const mName = normalizeVesselName(asString(getFieldValue(items[j]?.vessel_name)));
      if (refName && mName && refName === mName) return j;
    }
    for (let j = 0; j < items.length; j++) {
      if (!used.has(j)) return j;
    }
    return -1;
  }

  const maxLen = Math.max(refItems.length, modelItems.length);

  for (let i = 0; i < maxLen; i++) {
    const ref = refItems[i] ?? null;
    let model: VesselItem | null = null;

    if (ref !== null) {
      const refName = normalizeVesselName(asString(getFieldValue(ref?.vessel_name))) ?? '';
      const bestIdx = findBestMatch(refName, modelItems);
      if (bestIdx !== -1) { model = modelItems[bestIdx]; used.add(bestIdx); }
    } else {
      for (let j = 0; j < modelItems.length; j++) {
        if (!used.has(j)) { model = modelItems[j]; used.add(j); break; }
      }
    }

    const refName = asString(getFieldValue(ref?.vessel_name));
    const modelName = asString(getFieldValue(model?.vessel_name));
    const refImo = asString(getFieldValue(ref?.imo));
    const modelImo = asString(getFieldValue(model?.imo));
    const refFlag = asString(getFieldValue(ref?.flag));
    const modelFlag = asString(getFieldValue(model?.flag));
    const refBuilt = asNumber(getFieldValue(ref?.built));
    const modelBuilt = asNumber(getFieldValue(model?.built));
    const refDwt = asNumber(getFieldValue(ref?.dwt_summer));
    const modelDwt = asNumber(getFieldValue(model?.dwt_summer));
    const refDwcc = asNumber(getFieldValue(ref?.dwcc));
    const modelDwcc = asNumber(getFieldValue(model?.dwcc));
    const refOpenPos = asString(getFieldValue(ref?.open_position));
    const modelOpenPos = asString(getFieldValue(model?.open_position));
    const refOpenDate = asString(getFieldValue(ref?.open_date));
    const modelOpenDate = asString(getFieldValue(model?.open_date));

    const vesselNameMatch = ciEqual(normalizeVesselName(refName), normalizeVesselName(modelName));
    const imoMatch =
      refImo === null
        ? true
        : modelImo === null
          ? false
          : normalizeImo(refImo) === normalizeImo(modelImo);
    const nRef = normalizeFlag(refFlag);
    const nModel = normalizeFlag(modelFlag);
    const flagMatch = refFlag === null ? true :
      nRef === nModel ||
      (nRef.length > 4 && nModel.startsWith(nRef)) ||
      (nModel.length > 4 && nRef.startsWith(nModel));
    const builtMatch = refBuilt === null ? true : refBuilt === modelBuilt;
    const dwtMatch = withinTolerance(refDwt, modelDwt);
    const dwccMatch = withinTolerance(refDwcc, modelDwcc);

    const flags = [vesselNameMatch, imoMatch, flagMatch, builtMatch, dwtMatch, dwccMatch];
    const stringRate = flags.filter(Boolean).length / flags.length;

    results.push({
      ref_vessel_name: refName,
      model_vessel_name: modelName,
      ref_imo: refImo,
      model_imo: modelImo,
      ref_flag: refFlag,
      model_flag: modelFlag,
      ref_built: refBuilt,
      model_built: modelBuilt,
      ref_dwt: refDwt,
      model_dwt: modelDwt,
      ref_dwcc: refDwcc,
      model_dwcc: modelDwcc,
      ref_open_position: refOpenPos,
      model_open_position: modelOpenPos,
      ref_open_date: refOpenDate,
      model_open_date: modelOpenDate,
      vessel_name_match: vesselNameMatch,
      imo_match: imoMatch,
      flag_match: flagMatch,
      built_match: builtMatch,
      dwt_match: dwtMatch,
      dwcc_match: dwccMatch,
      string_field_match_rate: stringRate,
    });
  }
  return results;
}

function extractItems(raw: unknown): VesselItem[] {
  let items: VesselItem[] = [];
  if (Array.isArray(raw)) items = raw as VesselItem[];
  else if (raw && typeof raw === 'object') {
    const xs = (raw as { items?: unknown }).items;
    if (Array.isArray(xs)) items = xs as VesselItem[];
  }
  return dedupeVesselItems(items);
}

/**
 * Defense against a Gemini quirk where the model "thinks aloud" inside a
 * string field and ends up emitting hundreds of duplicate items until
 * max_tokens cuts it off. See etms-parse-vessel-046 (Sep 2025): one
 * vessel ADAMAR produced 941 duplicate entries because vessel_type
 * contained the model's reasoning prose. Dedup by (vessel_name, imo).
 */
function dedupeVesselItems(items: VesselItem[]): VesselItem[] {
  const seen = new Set<string>();
  const out: VesselItem[] = [];
  for (const it of items) {
    const name = (typeof it.vessel_name === 'object' && it.vessel_name
      ? String((it.vessel_name as { value?: unknown }).value ?? '')
      : String(it.vessel_name ?? '')).trim().toUpperCase();
    const imo = typeof it.imo === 'string' ? it.imo.trim() : String(it.imo ?? '').trim();
    const dwccVal = (typeof it.dwcc === 'object' && it.dwcc
      ? String((it.dwcc as { value?: unknown }).value ?? '')
      : String(it.dwcc ?? '')).trim();
    const key = `${name}|${imo}|${dwccVal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function runScenario(scenario: Scenario): Promise<RunResult> {
  const body = truncate(scenario.input.body, MAX_BODY_CHARS);
  const userPrompt = `From: ${scenario.input.from}\nSubject: ${scenario.input.subject}\nDate: ${scenario.input.date}\n\n${body}`;

  const t0 = Date.now();
  let model_output: ParsedOutput | null = null;
  let error: string | undefined;

  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    try {
      await sleep(REQUEST_DELAY_MS);
      const text = await callAiText(SCOPE, VESSEL_POSITION_PARSER_PROMPT, userPrompt, {
        maxTokens: 16000,
        timeoutMs: 180_000,
        temperature: 0,
        seed: 42,
        responseSchema: PARSE_VESSEL_SCHEMA as Record<string, unknown>,
      });
      const raw = extractJson(text);
      model_output = { items: extractItems(raw) };
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= 3) { error = msg; break; }
      const delay = [2000, 10000][attempt - 1] ?? 30000;
      console.error(`  [${scenario.id}] attempt ${attempt} ERR: ${msg.slice(0, 80)} — retry in ${delay / 1000}s`);
      await sleep(delay);
    }
  }

  const refItems = scenario.reference_output?.items ?? [];
  const modelItems = model_output?.items ?? [];
  const itemMatches = error ? [] : scoreVesselItems(refItems, modelItems);
  const matchRate = error
    ? 0
    : refItems.length === 0 && modelItems.length === 0
      ? 1
      : itemMatches.length === 0
        ? 0
        : itemMatches.reduce((s, m) => s + m.string_field_match_rate, 0) / itemMatches.length;

  return {
    scenario_id: scenario.id,
    category: scenario.category,
    input: scenario.input,
    reference_output: scenario.reference_output,
    model_output,
    error,
    duration_ms: Date.now() - t0,
    item_count_ref: refItems.length,
    item_count_model: modelItems.length,
    item_matches: itemMatches,
    match_rate: matchRate,
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
  const outArg = process.argv.indexOf('--output');

  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = outArg >= 0
    ? path.resolve(process.argv[outArg + 1])
    : path.join(RESULTS_DIR, `etms-parse-vessel-${round}.json`);

  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json')).sort();
  const allScenarios: Scenario[] = files.map((f) =>
    JSON.parse(readFileSync(path.join(CORPUS_DIR, f), 'utf-8')),
  );

  let scenarios = isFinite(limit) ? allScenarios.slice(0, limit) : allScenarios;
  if (scenarioFilter) scenarios = scenarios.filter((s) => s.id === scenarioFilter);

  const existing: Map<string, RunResult> = new Map();
  if (existsSync(outPath)) {
    const prev: RunResult[] = JSON.parse(readFileSync(outPath, 'utf-8'));
    for (const r of prev) existing.set(r.scenario_id, r);
  }
  const pending = scenarios.filter((s) => !existing.has(s.id) || existing.get(s.id)?.error);

  console.error(`[run-parse-vessel] round=${round} total=${scenarios.length} pending=${pending.length}`);

  let done = 0;
  const results: RunResult[] = [...existing.values()].filter((r) => !r.error);

  for (const scenario of pending) {
    const result = await runScenario(scenario);
    results.push(result);
    done++;
    if (done % 5 === 0 || done === pending.length) {
      writeFileSync(outPath, JSON.stringify(results, null, 2));
      const ok = results.filter((r) => !r.error).length;
      const err = results.filter((r) => r.error).length;
      console.error(`[run-parse-vessel] ${done}/${pending.length} done (ok=${ok} err=${err})`);
    }
  }

  writeFileSync(outPath, JSON.stringify(results, null, 2));

  const total = results.length;
  const fullMatch = results.filter((r) => !r.error && r.match_rate === 1).length;
  const errors = results.filter((r) => r.error).length;
  const meanRate = results.filter((r) => !r.error).reduce((s, r) => s + r.match_rate, 0) / Math.max(1, total - errors);

  console.error(`\n[run-parse-vessel] DONE round=${round}`);
  console.error(`Full deterministic match: ${fullMatch}/${total} (${((fullMatch / total) * 100).toFixed(1)}%) errors=${errors}`);
  console.error(`Mean deterministic-field match rate: ${(meanRate * 100).toFixed(1)}%`);
  console.error(`Output: ${outPath}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });
}
