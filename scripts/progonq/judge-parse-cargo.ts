#!/usr/bin/env -S npx tsx
/**
 * Opus-judge scorer for parse-cargo results.
 *
 * Reads .progonq/results/etms-parse-cargo-<round>.json, finds item-pairs
 * that string-scorer marked route_match=false, asks Opus 4.7 (Bedrock)
 * whether the pair is semantically equivalent in chartering context.
 *
 * Cache: .progonq/cache/judge-cache.json — keyed by sha256(ref||model).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts \
 *     --results .progonq/results/etms-parse-cargo-R7.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';

const CACHE_PATH = path.resolve(process.cwd(), '.progonq/cache/judge-cache.json');

interface JudgeVerdict {
  equiv: boolean;
  reason: string;
}

interface ItemMatchResult {
  ref_origin: string | null;
  ref_dest: string | null;
  model_origin: string | null;
  model_dest: string | null;
  route_match: boolean;
  semantic_route_match?: boolean;
  // Raw (un-normalized) strings — prefer these for judge to avoid normalization artifacts
  ref_origin_raw?: string | null;
  ref_dest_raw?: string | null;
  model_origin_raw?: string | null;
  model_dest_raw?: string | null;
}

interface RunResult {
  scenario_id: string;
  category: string;
  item_matches: ItemMatchResult[];
  route_match_rate: number;
  semantic_match_rate?: number;
  judge_verdicts?: Array<{ pair: string; ref: string; model: string; equiv: boolean; reason: string }>;
  [k: string]: unknown;
}

function loadCache(): Map<string, JudgeVerdict> {
  if (!existsSync(CACHE_PATH)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as Record<string, JudgeVerdict>;
    return new Map(Object.entries(raw));
  } catch (e) {
    console.error('[judge] cache parse failed, starting fresh:', (e as Error).message);
    return new Map();
  }
}

function saveCache(cache: Map<string, JudgeVerdict>): void {
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  const obj = Object.fromEntries(cache);
  writeFileSync(CACHE_PATH, JSON.stringify(obj, null, 2));
}

function pairKey(ref: string | null, model: string | null): string {
  return createHash('sha256').update(JSON.stringify({ ref, model })).digest('hex').slice(0, 16);
}

const JUDGE_SYSTEM = `You are a Senior Chartering Broker (dry-bulk + break-bulk, 20+ years).
Decide whether two port descriptions refer to the same maritime location
in a cargo inquiry context.

Equivalence rules:
- Aliases match: "Nemrut Bay" = "Nemrut"; "UK" = "United Kingdom"; "KAP" = "King Abdullah Port"; "ARA" = "ARA range" = "Amsterdam/Rotterdam/Antwerp range" = "ARA ports".
- Spelling variants match: "Giurgiulesti" = "Giurgiuleshti"; "Douala" = "Duala"; "Pidennyi" = "Pivdennyi".
- Annotation suffixes match the bare name: "X (Charterers Option)" = "X".
- "(port unspecified)" / "(unspecified port)" / "(unspecified)" qualifiers are decorative — match either side without them.
- Regional shorthand overlaps: "East Coast Greece" overlap with "Eastern Mediterranean Greece" (treat as equiv).
- "Port of Call" / "POC" / "Port to be nominated" / "TBN" / "port not yet nominated" / "to be nominated" all describe a destination port that the charterer has not yet specified — treat all of these as equivalent. Including when paired with a country: "Port of Call, Ukraine" = "Port to be nominated, Ukraine" = "Ukraine port (unspecified)" = "Port of Call (unspecified) / Ukraine port (unspecified)" — all are "unspecified destination in Ukraine".
- Country-only port descriptions are equivalent when paired with a "port unspecified"-style qualifier on the other side: e.g. "South Korea (port unspecified)" = "South Korea" = "open S.KOREA".
- Different ports do NOT match even if names look similar.
- Null on both sides = equivalent.
- Null on one side, named port on other = NOT equivalent.

MULTI-PORT EQUIVALENCE:
- "X or Y" / "X / Y chopt" / "either X or Y" = alternative ports (charterer's option). Both representations are equivalent regardless of which port is listed as "primary" vs in alternatives.
- "X + Y" / "X and Y" / "X then Y" / "combined X+Y" = rotation (vessel calls both). Port set + per-port weights matter; order does not.
- For rotation cargo, treat as equivalent when the set of (port, weight) pairs matches after canonical sorting by port name.
- "Port of Call" / "POC" / "Port to be nominated" / "TBN" / "port not yet nominated" = equivalent (unspecified destination). Including country-qualified forms: "Port of Call, Ukraine" = "Ukraine port (unspecified)" = "Port to be nominated, Ukraine".

EXPECTED OUTPUT DISTINCTIONS:
- One physical cargo with 2+ ports → ONE item in the array (alternatives or rotation). Both representations of the same cargo movement are equivalent.
- Two distinct cargo offers (different commodity or tonnage parcels) → TWO items. Non-matching item counts indicate a parsing difference, not semantic equivalence.

Reply ONLY with JSON: {"equiv": true | false, "reason": "one short sentence"}`;

async function judgePair(ref: string | null, model: string | null): Promise<JudgeVerdict> {
  if (ref === model) return { equiv: true, reason: 'identical strings' };
  const userMsg = `REF:   ${JSON.stringify(ref)}\nMODEL: ${JSON.stringify(model)}`;
  try {
    const raw = await callAiText('PARSE_CARGO_JUDGE', JUDGE_SYSTEM, userMsg, {
      maxTokens: 200,
      timeoutMs: 30_000,
    });
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned) as JudgeVerdict;
    if (typeof parsed.equiv !== 'boolean') throw new Error('equiv not boolean');
    return parsed;
  } catch (e) {
    console.error('[judge] parse fail for pair:', { ref, model, err: (e as Error).message.slice(0, 80) });
    return { equiv: false, reason: 'judge parse error — conservative non-match' };
  }
}

async function main() {
  const resultsArgIdx = process.argv.indexOf('--results');
  if (resultsArgIdx < 0) {
    console.error('Usage: judge-parse-cargo.ts --results <path/to/results.json>');
    process.exit(1);
  }
  const resultsPath = path.resolve(process.argv[resultsArgIdx + 1]);
  const results: RunResult[] = JSON.parse(readFileSync(resultsPath, 'utf-8'));
  const cache = loadCache();

  let pairsJudged = 0;
  let pairsCached = 0;

  for (const r of results) {
    const verdicts: Array<{ pair: string; ref: string; model: string; equiv: boolean; reason: string }> = [];
    let semanticMatches = 0;
    const total = r.item_matches.length;
    for (const m of r.item_matches) {
      if (m.route_match) {
        m.semantic_route_match = true;
        semanticMatches++;
        continue;
      }
      // Prefer raw (un-normalized) strings so judge sees original text.
      // Fallback to normalized for results produced before raw-values were added.
      const refOriginJ = m.ref_origin_raw ?? m.ref_origin;
      const modelOriginJ = m.model_origin_raw ?? m.model_origin;
      const refDestJ = m.ref_dest_raw ?? m.ref_dest;
      const modelDestJ = m.model_dest_raw ?? m.model_dest;

      const origPair = pairKey(refOriginJ, modelOriginJ);
      const destPair = pairKey(refDestJ, modelDestJ);

      let origV = cache.get(origPair);
      if (!origV) {
        await new Promise((res) => setTimeout(res, 800));
        origV = await judgePair(refOriginJ, modelOriginJ);
        cache.set(origPair, origV);
        saveCache(cache);
        pairsJudged++;
      } else pairsCached++;

      let destV = cache.get(destPair);
      if (!destV) {
        await new Promise((res) => setTimeout(res, 800));
        destV = await judgePair(refDestJ, modelDestJ);
        cache.set(destPair, destV);
        saveCache(cache);
        pairsJudged++;
      } else pairsCached++;

      const semanticMatch = origV.equiv && destV.equiv;
      m.semantic_route_match = semanticMatch;
      if (semanticMatch) semanticMatches++;
      verdicts.push({ pair: 'origin', ref: refOriginJ ?? '', model: modelOriginJ ?? '', equiv: origV.equiv, reason: origV.reason });
      verdicts.push({ pair: 'dest', ref: refDestJ ?? '', model: modelDestJ ?? '', equiv: destV.equiv, reason: destV.reason });
    }

    r.judge_verdicts = verdicts;
    r.semantic_match_rate = total === 0 ? 1 : semanticMatches / total;
  }

  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  const fullSemantic = results.filter((r) => (r.semantic_match_rate ?? 0) === 1).length;
  const fullString = results.filter((r) => r.route_match_rate === 1).length;
  console.error(`[judge] pairs_judged=${pairsJudged} cached=${pairsCached}`);
  console.error(`[judge] string_full=${fullString}/${results.length} (${(fullString/results.length*100).toFixed(1)}%)`);
  console.error(`[judge] semantic_full=${fullSemantic}/${results.length} (${(fullSemantic/results.length*100).toFixed(1)}%)`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
