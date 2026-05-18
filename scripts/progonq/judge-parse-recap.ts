#!/usr/bin/env -S npx tsx
/**
 * Semantic judge for parse-recap results.
 *
 * For each scenario, compares model_output[field] vs reference_output[field]
 * across the union of GT keys. Field-pair equivalence uses:
 *   - null/null    -> equiv
 *   - null/value   -> NOT equiv (under-extraction)
 *   - value/null   -> NOT equiv
 *   - identical str/num -> equiv (deterministic)
 *   - numeric within ±5% tolerance -> equiv
 *   - otherwise -> semantic judge LLM call (cached)
 *
 * Cache: .progonq/cache/judge-cache.json (shared with parse-vessel/cargo).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/judge-parse-recap.ts --results <path>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';

const CACHE_PATH = path.resolve(process.cwd(), '.progonq/cache/judge-cache.json');

interface Verdict { equiv: boolean; reason: string; }

interface RunResult {
  scenario_id: string;
  reference_output: Record<string, unknown>;
  model_output: Record<string, unknown> | null;
  error?: string;
  field_verdicts?: Record<string, Verdict>;
}

function loadCache(): Map<string, Verdict> {
  if (!existsSync(CACHE_PATH)) return new Map();
  try { return new Map(Object.entries(JSON.parse(readFileSync(CACHE_PATH, 'utf-8')))); }
  catch { return new Map(); }
}

function saveCache(c: Map<string, Verdict>): void {
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(c), null, 2));
}

function pairKey(field: string, ref: unknown, model: unknown): string {
  return `recap:${field}:` + createHash('sha256').update(JSON.stringify([ref, model])).digest('hex').slice(0, 32);
}

function getValue(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return (v as { value: unknown }).value;
  }
  return v;
}

function toComparable(v: unknown): string | number | boolean | null {
  const x = getValue(v);
  if (x == null) return null;
  if (typeof x === 'string') {
    const trimmed = x.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof x === 'number' || typeof x === 'boolean') return x;
  if (Array.isArray(x)) {
    if (x.length === 0) return null;
    return JSON.stringify(x);
  }
  if (typeof x === 'object') return JSON.stringify(x);
  return String(x);
}

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!?'"`]/g, '').trim();
}

function withinTolerance(a: number, b: number, tol = 0.05): boolean {
  if (a === 0) return b === 0;
  return Math.abs(a - b) / Math.abs(a) <= tol;
}

const SEMANTIC_JUDGE_SYSTEM = `You judge whether two values for a fixture recap field describe the SAME thing.

Field-pair examples that ARE equivalent:
- "GULF MARITIME BROKERS LLC" = "Gulf Maritime Brokers LLC"
- "8/12 May 2026" = "08-12 May 2026" = "8th to 12th May 2026"
- "USD 25 PMT FIOST" = "25 USD per metric ton, FIOST basis"
- "Full despatch" = "FD" = "Despatch at demurrage rate"
- "BIMCO GENCON 94" = "Gencon 1994" = "GENCON '94"

NOT equivalent:
- Different ports / vessels / numbers / dates outside tolerance
- One value null, the other not (under-extraction)
- Partial extraction missing material info

Reply ONLY with JSON: {"equiv": true|false, "reason": "one short sentence"}`;

async function judgePair(field: string, ref: unknown, model: unknown): Promise<Verdict> {
  const userMsg = `FIELD: ${field}\nREF:   ${JSON.stringify(toComparable(ref))}\nMODEL: ${JSON.stringify(toComparable(model))}`;
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const raw = await callAiText('PARSE_RECAP_JUDGE', SEMANTIC_JUDGE_SYSTEM, userMsg, {
        maxTokens: 200, timeoutMs: 30_000,
      });
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned) as Verdict;
      if (typeof parsed.equiv !== 'boolean') throw new Error('equiv not boolean');
      return parsed;
    } catch (e) {
      lastErr = (e as Error).message.slice(0, 80);
      const isRate = /too many requests|throttl|rate.?limit|429/i.test(lastErr);
      if (attempt < 4 && isRate) { await new Promise(r => setTimeout(r, 5_000 * attempt)); continue; }
      break;
    }
  }
  console.error('[judge-pr] parse fail:', { field, ref, model, err: lastErr });
  return { equiv: false, reason: 'judge parse error — conservative non-match' };
}

async function getCached(
  cache: Map<string, Verdict>, field: string, ref: unknown, model: unknown,
  stats: { judged: number; cached: number },
): Promise<Verdict> {
  const refC = toComparable(ref);
  const modelC = toComparable(model);

  // Deterministic checks before LLM call
  if (refC === null && modelC === null) return { equiv: true, reason: 'both null' };
  if (refC === null || modelC === null) return { equiv: false, reason: 'one null one not' };
  if (refC === modelC) return { equiv: true, reason: 'identical' };
  if (typeof refC === 'number' && typeof modelC === 'number' && withinTolerance(refC, modelC)) {
    return { equiv: true, reason: 'within ±5%' };
  }
  if (typeof refC === 'string' && typeof modelC === 'string' && normalizeStr(refC) === normalizeStr(modelC)) {
    return { equiv: true, reason: 'case/whitespace match' };
  }

  const key = pairKey(field, ref, model);
  const hit = cache.get(key);
  if (hit) { stats.cached++; return hit; }
  await new Promise(r => setTimeout(r, 800));
  const verdict = await judgePair(field, ref, model);
  if (!verdict.reason.startsWith('judge parse error')) { cache.set(key, verdict); saveCache(cache); }
  stats.judged++;
  return verdict;
}

async function main() {
  const idx = process.argv.indexOf('--results');
  if (idx < 0) { console.error('Usage: judge-parse-recap.ts --results <path>'); process.exit(1); }
  const resultsPath = path.resolve(process.argv[idx + 1]);
  const results: RunResult[] = JSON.parse(readFileSync(resultsPath, 'utf-8'));
  const cache = loadCache();
  const stats = { judged: 0, cached: 0 };

  const fieldStats = new Map<string, { pass: number; total: number }>();

  for (const r of results) {
    if (!r.reference_output) continue;
    const refKeys = Object.keys(r.reference_output);
    const verdicts: Record<string, Verdict> = {};
    for (const field of refKeys) {
      const ref = r.reference_output[field];
      const model = r.model_output?.[field];
      const v = await getCached(cache, field, ref, model, stats);
      verdicts[field] = v;
      const s = fieldStats.get(field) ?? { pass: 0, total: 0 };
      s.total++;
      if (v.equiv) s.pass++;
      fieldStats.set(field, s);
    }
    r.field_verdicts = verdicts;
  }

  writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  console.error(`[judge-pr] pairs_judged=${stats.judged} cached=${stats.cached}`);
  console.error(`[judge-pr] scenarios=${results.length}`);
  const totalPass = [...fieldStats.values()].reduce((a, s) => a + s.pass, 0);
  const totalAll = [...fieldStats.values()].reduce((a, s) => a + s.total, 0);
  console.error(`[judge-pr] overall_field_accuracy: ${totalPass}/${totalAll} (${(totalPass/totalAll*100).toFixed(1)}%)`);
  const fullPass = results.filter(r => Object.values(r.field_verdicts ?? {}).every(v => v.equiv)).length;
  console.error(`[judge-pr] semantic_full: ${fullPass}/${results.length} (${(fullPass/results.length*100).toFixed(1)}%)`);
  console.error('[judge-pr] per-field accuracy:');
  const sorted = [...fieldStats.entries()].sort((a, b) => (a[1].pass/a[1].total) - (b[1].pass/b[1].total));
  for (const [field, s] of sorted) {
    const pct = (s.pass / s.total * 100).toFixed(1);
    console.error(`  ${field.padEnd(28)} ${s.pass}/${s.total} (${pct}%)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
