#!/usr/bin/env -S npx tsx
/**
 * LLM-judge scorer for parse-vessel results.
 *
 * Reads .progonq/results/etms-parse-vessel-<round>.json, semantically judges
 * the fields that resist string equality: vessel_name (aliases, M.V. prefixes),
 * open_position (UNLOCODE or free-text), open_date (window equivalence).
 * Deterministic fields (imo, flag, built, dwt±5%, dwcc±5%) are taken from the
 * runner's boolean flags.
 *
 * Cache: .progonq/cache/judge-cache.json — shared with parse-cargo (keyed by
 *        prefixed sha256(ref||model)).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/judge-parse-vessel.ts \
 *     --results .progonq/results/etms-parse-vessel-baseline.json [--judge sonnet]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';

const CACHE_PATH = path.resolve(process.cwd(), '.progonq/cache/judge-cache.json');

interface JudgeVerdict { equiv: boolean; reason: string; }

interface VesselMatch {
  ref_vessel_name: string | null; model_vessel_name: string | null;
  ref_open_position: string | null; model_open_position: string | null;
  ref_open_date: string | null; model_open_date: string | null;
  ref_flag?: string | null; model_flag?: string | null;
  vessel_name_match: boolean;
  imo_match: boolean; flag_match: boolean; built_match: boolean;
  dwt_match: boolean; dwcc_match: boolean;
  semantic_field_match?: Record<string, boolean>;
}

interface RunResult {
  scenario_id: string;
  category: string;
  item_matches: VesselMatch[];
  match_rate: number;
  semantic_match_rate?: number;
  [k: string]: unknown;
}

function loadCache(): Map<string, JudgeVerdict> {
  if (!existsSync(CACHE_PATH)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as Record<string, JudgeVerdict>;
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

function saveCache(cache: Map<string, JudgeVerdict>): void {
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(cache), null, 2));
}

function pairKey(prefix: string, ref: string | null, model: string | null): string {
  return createHash('sha256').update(JSON.stringify({ prefix, ref, model })).digest('hex').slice(0, 16);
}

const VESSEL_NAME_JUDGE = `You decide whether two vessel names refer to the same ship.
Equivalence rules:
- "MV", "M.V.", "M/V", "MS", "M/S", "SS", "S.S.", "MT" prefixes are decorative — ignore.
- Case, punctuation, extra spaces — ignore.
- Common transliterations match (e.g. "ALEXANDRIA STAR" = "ALEXANDRIA-STAR").
- Different names do NOT match even if similar.
- Null on both = equivalent. Null on one = NOT equivalent.
Reply ONLY with JSON: {"equiv": true|false, "reason": "one short sentence"}`;

const OPEN_POSITION_JUDGE = `You decide whether two vessel "open position" descriptions refer to the same maritime location.
Equivalence rules:
- UNLOCODE matches free-text: "TRPMR" = "Iskenderun, Turkey".
- Country suffix decorative: "Teignmouth" = "Teignmouth, UK".
- Aliases match: "ARA" = "Amsterdam/Rotterdam/Antwerp range".
- "Spot" / "promptly" / "available" qualifiers are decorative.
- Different ports do NOT match.
- Null on both = equivalent. Null on one = NOT equivalent.
Reply ONLY with JSON: {"equiv": true|false, "reason": "one short sentence"}`;

export const FLAG_JUDGE = `You decide whether two vessel flag / country-of-registration values refer to the same country or territory.
Equivalence rules:
- City name for a country's capital = country itself: "Belize City" = "Belize", "Port Louis" = "Mauritius".
- Abbreviated or partial name: "ST VINCENT" = "Saint Vincent and the Grenadines".
- Territory = parent state: "Madeira" = "Portugal", "Gibraltar" = "United Kingdom".
- Case and punctuation: ignore.
- Different countries do NOT match.
- Null on both = equivalent. Null on one = NOT equivalent.
Reply ONLY with JSON: {"equiv": true|false, "reason": "one short sentence"}`;

const OPEN_DATE_JUDGE = `You decide whether two vessel open-date / laycan values describe the same window.
Equivalence rules:
- Format variations same range: "25/28 July 2017" = "Jul 25-28, 2017" = "2017-07-25 to 2017-07-28".
- "Spot prompt" = "promptly available" = "spot".
- "Early July" = "1-10 July"; "mid-July" = "11-20 July"; "end July" = "21-31 July".
- Different windows do NOT match.
- Null on both = equivalent. Null on one = NOT equivalent.
Reply ONLY with JSON: {"equiv": true|false, "reason": "one short sentence"}`;

async function judgePair(ref: string | null, model: string | null, system: string): Promise<JudgeVerdict> {
  if (ref === model) return { equiv: true, reason: 'identical strings' };
  const userMsg = `REF:   ${JSON.stringify(ref)}\nMODEL: ${JSON.stringify(model)}`;
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const raw = await callAiText('PARSE_VESSEL_JUDGE', system, userMsg, { maxTokens: 200, timeoutMs: 30_000 });
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned) as JudgeVerdict;
      if (typeof parsed.equiv !== 'boolean') throw new Error('equiv not boolean');
      return parsed;
    } catch (e) {
      lastErr = (e as Error).message.slice(0, 80);
      const isRate = /too many requests|throttl|rate.?limit|429/i.test(lastErr);
      if (attempt < 4 && isRate) {
        await new Promise((r) => setTimeout(r, 5_000 * attempt));
        continue;
      }
      break;
    }
  }
  console.error('[judge-pv] parse fail:', { ref, model, err: lastErr });
  return { equiv: false, reason: 'judge parse error — conservative non-match' };
}

async function getCached(
  cache: Map<string, JudgeVerdict>, prefix: string,
  ref: string | null, model: string | null, system: string,
  stats: { judged: number; cached: number },
): Promise<JudgeVerdict> {
  const key = pairKey(prefix, ref, model);
  const hit = cache.get(key);
  if (hit) { stats.cached++; return hit; }
  await new Promise((r) => setTimeout(r, 800));
  const verdict = await judgePair(ref, model, system);
  if (!verdict.reason.startsWith('judge parse error')) {
    cache.set(key, verdict);
    saveCache(cache);
  }
  stats.judged++;
  return verdict;
}

async function main() {
  const idx = process.argv.indexOf('--results');
  if (idx < 0) {
    console.error('Usage: judge-parse-vessel.ts --results <path/to/results.json>');
    process.exit(1);
  }
  const resultsPath = path.resolve(process.argv[idx + 1]);
  const results: RunResult[] = JSON.parse(readFileSync(resultsPath, 'utf-8'));
  const cache = loadCache();
  const stats = { judged: 0, cached: 0 };

  for (const r of results) {
    let semanticMatches = 0;
    const total = r.item_matches.length;

    for (const m of r.item_matches) {
      const nameV = m.vessel_name_match
        ? { equiv: true, reason: 'deterministic match' }
        : await getCached(cache, 'vessel_name:', m.ref_vessel_name, m.model_vessel_name, VESSEL_NAME_JUDGE, stats);
      const posV = await getCached(cache, 'open_position:', m.ref_open_position, m.model_open_position, OPEN_POSITION_JUDGE, stats);
      const dateV = await getCached(cache, 'open_date:', m.ref_open_date, m.model_open_date, OPEN_DATE_JUDGE, stats);
      const flagV = await getCached(cache, 'flag:', m.ref_flag ?? null, m.model_flag ?? null, FLAG_JUDGE, stats);

      m.semantic_field_match = {
        vessel_name: nameV.equiv,
        imo: m.imo_match,
        flag: flagV.equiv,
        built: m.built_match,
        dwt_summer: m.dwt_match,
        dwcc: m.dwcc_match,
        open_position: posV.equiv,
        open_date: dateV.equiv,
      };

      const allFields = Object.values(m.semantic_field_match);
      const itemRate = allFields.filter(Boolean).length / allFields.length;
      if (itemRate === 1) semanticMatches++;
    }

    if (r.error) {
      r.semantic_match_rate = 0;
    } else {
      r.semantic_match_rate = total === 0 ? 1 : semanticMatches / total;
    }
  }

  writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  const total = results.length;
  const fullSemantic = results.filter((r) => (r.semantic_match_rate ?? 0) === 1).length;
  const fullString = results.filter((r) => r.match_rate === 1).length;
  console.error(`[judge-pv] pairs_judged=${stats.judged} cached=${stats.cached}`);
  console.error(`[judge-pv] string_full=${fullString}/${total} (${(fullString / total * 100).toFixed(1)}%)`);
  console.error(`[judge-pv] semantic_full=${fullSemantic}/${total} (${(fullSemantic / total * 100).toFixed(1)}%)`);

  // Per-field aggregation
  const FIELDS = ['vessel_name', 'imo', 'flag', 'built', 'dwt_summer', 'dwcc', 'open_position', 'open_date'] as const;
  const tot: Record<string, { m: number; t: number }> = {};
  for (const f of FIELDS) tot[f] = { m: 0, t: 0 };
  for (const r of results) {
    for (const m of r.item_matches) {
      const sfm = m.semantic_field_match;
      if (!sfm) continue;
      for (const f of FIELDS) { tot[f].t++; if (sfm[f]) tot[f].m++; }
    }
  }
  console.error('[judge-pv] per-field accuracy:');
  for (const f of FIELDS) {
    const { m, t } = tot[f];
    console.error(`  ${f.padEnd(20)} ${m}/${t} (${t === 0 ? 'n/a' : (m / t * 100).toFixed(1) + '%'})`);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
