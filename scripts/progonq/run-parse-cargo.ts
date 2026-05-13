#!/usr/bin/env -S npx tsx
/**
 * progonq runner for parse-cargo endpoint.
 *
 * Runs CARGO_INQUIRY_PARSER_PROMPT against .progonq/corpus/etms-parse-cargo/
 * scenarios and saves results to .progonq/results/etms-parse-cargo-<round>.json.
 * Resumable: skips scenarios already in results file.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts [--round R0] [--limit N] [--scenario scenario-001]
 *
 * Env:
 *   PARSE_CARGO_PROVIDER=gemini (default)
 *   AI_PROVIDER fallback
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts/parse-cargo';

const SCOPE = 'PARSE_CARGO';
const MAX_BODY_CHARS = 5000;
const REQUEST_DELAY_MS = 400;

const CORPUS_DIR = path.resolve(process.cwd(), '.progonq/corpus/etms-parse-cargo');
const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

interface ConfidenceField {
  value: unknown;
  confidence: string;
  source_text?: string;
}

interface CargoItem {
  origin_port?: ConfidenceField | null;
  destination_port?: ConfidenceField | null;
  weight_mt?: ConfidenceField | null;
  cargo_description?: ConfidenceField | null;
  origin_port_alternatives?: unknown;
  origin_port_rotation?: unknown;
  destination_port_alternatives?: unknown;
  destination_port_rotation?: unknown;
  weight_per_port?: unknown;
  [key: string]: unknown;
}

interface ParsedOutput {
  items: CargoItem[];
}

interface Scenario {
  id: string;
  source_email_id: string;
  category: string;
  input: { subject: string; from: string; date: string; body: string };
  reference_output: ParsedOutput;
}

interface ItemMatchResult {
  ref_origin: string | null;
  ref_dest: string | null;
  ref_weight: number | null;
  ref_commodity: string | null;
  model_origin: string | null;
  model_dest: string | null;
  model_weight: number | null;
  model_commodity: string | null;
  route_match: boolean;
  weight_match: boolean;
  // Raw (un-normalized) strings — for judge: sees original text, not normalized form
  ref_origin_raw: string | null;
  ref_dest_raw: string | null;
  model_origin_raw: string | null;
  model_dest_raw: string | null;
  // Multi-port sub-match fields
  origin_alts_match: boolean;
  origin_rotation_match: boolean;
  dest_alts_match: boolean;
  dest_rotation_match: boolean;
  weight_per_port_match: boolean;
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
  item_matches: ItemMatchResult[];
  route_match_rate: number;
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

function getFieldValue(field: ConfidenceField | null | undefined): unknown {
  if (field == null) return null;
  return field.value ?? null;
}

export function normalizePort(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  let s = v.trim().toLowerCase().replace(/\s+/g, ' ');
  // Strip diacritics — reference corpus is inconsistent (constanta vs constanța)
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');

  // === PORT NAME ALIASES ===
  s = s.replace(/\bveracruz\b/g, 'vera cruz');
  s = s.replace(/\bnemrut bay\b/g, 'nemrut');
  s = s.replace(/\bporto marghera(?:\s*\(venice\))?\b/g, 'marghera');
  s = s.replace(/\bking abdullah port\b/g, 'king abdullah');
  // Strip "port " prefix (e.g. "port sousse" → "sousse") but not "port of call"
  s = s.replace(/^port (?!of call|of )/g, '');
  // Strip country suffix "city,country" or "city, country" → "city"
  s = s.replace(/,\s*[a-z ]+$/, '');
  // Alias: visakhapatnam / vizag
  s = s.replace(/\bvizag\b/g, 'visakhapatnam');

  // === SEPARATOR NORMALIZATION ===
  // "/" between ports → " or " (alternative ports)
  s = s.replace(/ \/ /g, ' or ');
  // "+" between ports → " and " (multi-port rotation — vessel calls both)
  s = s.replace(/ \+ /g, ' and ');

  // === QUALIFIER NORMALIZATION ===
  // Chopt notation: "X (option: Y)" == "X or Y"
  s = s.replace(/\s*\(option:\s*([^)]+)\)/g, ' or $1');
  // Strip unspecified-port parentheticals
  s = s.replace(/\s*\(port unspecified\)/g, '');
  s = s.replace(/\s*\(unspecified port\)/g, '');
  s = s.replace(/\s*\(unspecified\)/g, '');

  // === PORT COUNT QUALIFIER STRIPPING ===
  // Strip prefix forms: "1 safe port safe berth X", "1spsb X", "1 sp X", "1 sb X"
  s = s.replace(/^1\s*(?:safe port\s*(?:safe berth\s*)?|safe berth\s*|spsb\s*|sp\s*|sb\s*|port\s*)/, '');
  // Strip suffix forms: "X (1 safe port safe berth)", "X (1 port)"
  s = s.replace(/\s*\(1\s*(?:safe port(?:\s*safe berth)?|safe berth|port|spsb|sp|sb)\)$/i, '');
  // Strip trailing generic " port" qualifier (e.g. "egypt mediterranean port" → "egypt mediterranean")
  s = s.replace(/ port$/, '');
  // Strip trailing single-word parenthetical (country/region qualifiers, e.g. "Georgetown (Guyana)" → "Georgetown")
  s = s.replace(/\s*\(\w+\)$/, '');

  return s.trim() || null;
}

function normalizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v) => normalizePort(typeof v === 'string' ? v : v != null ? String(v) : null))
    .filter((s): s is string => s !== null);
}

function normalizeStringSet(arr: unknown): string[] {
  return normalizeStringArray(arr).sort();
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function rotationCanonicalKey(ports: string[], weights: number[] | null): string {
  const pairs = ports.map((p, i) => [p, weights?.[i] ?? null] as const);
  pairs.sort((x, y) => x[0].localeCompare(y[0]));
  return JSON.stringify(pairs);
}

function rawFieldString(field: ConfidenceField | null | undefined): string | null {
  if (field == null) return null;
  const v = field.value;
  return typeof v === 'string' ? v : v != null ? String(v) : null;
}

export function scoreItems(refItems: CargoItem[], modelItems: CargoItem[]): ItemMatchResult[] {
  const results: ItemMatchResult[] = [];
  const maxLen = Math.max(refItems.length, modelItems.length);

  for (let i = 0; i < maxLen; i++) {
    const ref = refItems[i] ?? null;
    const model = modelItems[i] ?? null;

    // Raw (un-normalized) strings — preserved for judge so it sees original text
    const refOriginRaw = rawFieldString(ref?.origin_port as ConfidenceField | null);
    const refDestRaw = rawFieldString(ref?.destination_port as ConfidenceField | null);
    const modelOriginRaw = rawFieldString(model?.origin_port as ConfidenceField | null);
    const modelDestRaw = rawFieldString(model?.destination_port as ConfidenceField | null);

    // Normalized strings — used only for string scorer (route_match)
    const refOrigin = normalizePort(refOriginRaw);
    const refDest = normalizePort(refDestRaw);
    const refWeight = getFieldValue(ref?.weight_mt as ConfidenceField | null) as number | null;
    const refCommodity = getFieldValue(ref?.cargo_description as ConfidenceField | null) as string | null;

    const modelOrigin = normalizePort(modelOriginRaw);
    const modelDest = normalizePort(modelDestRaw);
    const modelWeight = getFieldValue(model?.weight_mt as ConfidenceField | null) as number | null;
    const modelCommodity = getFieldValue(model?.cargo_description as ConfidenceField | null) as string | null;

    // Multi-port: normalize alternatives/rotation arrays as sorted sets
    const refOriginAlts = normalizeStringSet(ref?.origin_port_alternatives);
    const refOriginRot = normalizeStringSet(ref?.origin_port_rotation);
    const refDestAlts = normalizeStringSet(ref?.destination_port_alternatives);
    const refDestRot = normalizeStringSet(ref?.destination_port_rotation);
    const refWPP = Array.isArray(ref?.weight_per_port) ? (ref!.weight_per_port as number[]) : null;

    const modelOriginAlts = normalizeStringSet(model?.origin_port_alternatives);
    const modelOriginRot = normalizeStringSet(model?.origin_port_rotation);
    const modelDestAlts = normalizeStringSet(model?.destination_port_alternatives);
    const modelDestRot = normalizeStringSet(model?.destination_port_rotation);
    const modelWPP = Array.isArray(model?.weight_per_port) ? (model!.weight_per_port as number[]) : null;

    const originAltsMatch = setsEqual(refOriginAlts, modelOriginAlts);
    const originRotMatch = setsEqual(refOriginRot, modelOriginRot);
    const destAltsMatch = setsEqual(refDestAlts, modelDestAlts);
    const destRotMatch = setsEqual(refDestRot, modelDestRot);

    // weight_per_port: use canonical (port,weight) pairs sorted by port name
    // Use normalizeStringArray (preserves order = preserves port-weight pairing)
    const refDestRotRaw = normalizeStringArray(ref?.destination_port_rotation);
    const refOriginRotRaw = normalizeStringArray(ref?.origin_port_rotation);
    const modelDestRotRaw = normalizeStringArray(model?.destination_port_rotation);
    const modelOriginRotRaw = normalizeStringArray(model?.origin_port_rotation);
    const refRotPortsRaw = refDestRotRaw.length ? refDestRotRaw : refOriginRotRaw;
    const modelRotPortsRaw = modelDestRotRaw.length ? modelDestRotRaw : modelOriginRotRaw;
    const weightPerPortMatch =
      refWPP === null && modelWPP === null
        ? true
        : rotationCanonicalKey(refRotPortsRaw, refWPP) === rotationCanonicalKey(modelRotPortsRaw, modelWPP);

    // Origin/dest universe: if rotation present, rotation set covers all ports;
    // otherwise primary + alternatives. Used for universe-equality check.
    const refOriginUniverse = refOriginRot.length > 0
      ? refOriginRot
      : [refOrigin, ...refOriginAlts].filter((s): s is string => s !== null).sort();
    const modelOriginUniverse = modelOriginRot.length > 0
      ? modelOriginRot
      : [modelOrigin, ...modelOriginAlts].filter((s): s is string => s !== null).sort();
    const refDestUniverse = refDestRot.length > 0
      ? refDestRot
      : [refDest, ...refDestAlts].filter((s): s is string => s !== null).sort();
    const modelDestUniverse = modelDestRot.length > 0
      ? modelDestRot
      : [modelDest, ...modelDestAlts].filter((s): s is string => s !== null).sort();

    const originUniverseMatch = setsEqual(refOriginUniverse, modelOriginUniverse);
    const destUniverseMatch = setsEqual(refDestUniverse, modelDestUniverse);

    const routeMatch =
      originUniverseMatch && destUniverseMatch && originRotMatch && destRotMatch;
    const weightMatch = refWeight === modelWeight;

    results.push({
      ref_origin: refOrigin,
      ref_dest: refDest,
      ref_weight: refWeight,
      ref_commodity: refCommodity,
      model_origin: modelOrigin,
      model_dest: modelDest,
      model_weight: modelWeight,
      model_commodity: modelCommodity,
      route_match: routeMatch,
      weight_match: weightMatch,
      ref_origin_raw: refOriginRaw,
      ref_dest_raw: refDestRaw,
      model_origin_raw: modelOriginRaw,
      model_dest_raw: modelDestRaw,
      origin_alts_match: originAltsMatch,
      origin_rotation_match: originRotMatch,
      dest_alts_match: destAltsMatch,
      dest_rotation_match: destRotMatch,
      weight_per_port_match: weightPerPortMatch,
    });
  }
  return results;
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
      const text = await callAiText(SCOPE, CARGO_INQUIRY_PARSER_PROMPT, userPrompt, {
        maxTokens: 4096,
        timeoutMs: 180_000,
        temperature: 0,
        seed: 42,
      });
      const parsed = extractJson(text) as ParsedOutput;
      model_output = { items: Array.isArray(parsed.items) ? parsed.items : [] };
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
  const itemMatches = error ? [] : scoreItems(refItems, modelItems);
  // Both ref and model agree on 0 items (e.g. TCT guard) = correct match
  const routeMatchRate = error
    ? 0
    : refItems.length === 0 && modelItems.length === 0
      ? 1
      : itemMatches.length === 0
        ? 0
        : itemMatches.filter((m) => m.route_match).length / itemMatches.length;

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
    route_match_rate: routeMatchRate,
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
  const outPath = path.join(RESULTS_DIR, `etms-parse-cargo-${round}.json`);

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

  console.error(`[run-parse-cargo] round=${round} total=${scenarios.length} pending=${pending.length}`);

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
      const routeOk = results.filter((r) => r.route_match_rate === 1).length;
      console.error(`[run-parse-cargo] ${done}/${pending.length} done (ok=${ok} err=${err} full_route_match=${routeOk})`);
    }
  }

  writeFileSync(outPath, JSON.stringify(results, null, 2));

  // Summary by category
  const byCat: Record<string, { total: number; full_match: number; partial: number; mismatch: number; errors: number }> = {};
  for (const r of results) {
    if (!byCat[r.category]) byCat[r.category] = { total: 0, full_match: 0, partial: 0, mismatch: 0, errors: 0 };
    byCat[r.category].total++;
    if (r.error) { byCat[r.category].errors++; continue; }
    if (r.route_match_rate === 1) byCat[r.category].full_match++;
    else if (r.route_match_rate > 0) byCat[r.category].partial++;
    else byCat[r.category].mismatch++;
  }

  const total = results.length;
  const fullMatch = results.filter((r) => !r.error && r.route_match_rate === 1).length;
  const errors = results.filter((r) => r.error).length;

  console.error(`\n[run-parse-cargo] DONE round=${round}`);
  console.error(`Overall route match: ${fullMatch}/${total} (${((fullMatch / total) * 100).toFixed(1)}%) errors=${errors}`);
  console.error('By category:', JSON.stringify(byCat, null, 2));
  console.error(`Output: ${outPath}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
