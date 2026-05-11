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
- Aliases match: "Nemrut Bay" = "Nemrut"; "UK" = "United Kingdom"; "KAP" = "King Abdullah Port".
- Spelling variants match: "Giurgiulesti" = "Giurgiuleshti"; "Douala" = "Duala"; "Pidennyi" = "Pivdennyi".
- Annotation suffixes match the bare name: "X (Charterers Option)" = "X".
- "(port unspecified)" / "(unspecified port)" qualifier is decorative — match either side without it.
- Regional shorthand overlaps: "East Coast Greece" overlap with "Eastern Mediterranean Greece" (treat as equiv).
- Different ports do NOT match even if names look similar.
- Null on both sides = equivalent.
- Null on one side, named port on other = NOT equivalent.

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
      const origPair = pairKey(m.ref_origin, m.model_origin);
      const destPair = pairKey(m.ref_dest, m.model_dest);

      let origV = cache.get(origPair);
      if (!origV) {
        origV = await judgePair(m.ref_origin, m.model_origin);
        cache.set(origPair, origV);
        saveCache(cache);
        pairsJudged++;
      } else pairsCached++;

      let destV = cache.get(destPair);
      if (!destV) {
        destV = await judgePair(m.ref_dest, m.model_dest);
        cache.set(destPair, destV);
        saveCache(cache);
        pairsJudged++;
      } else pairsCached++;

      const semanticMatch = origV.equiv && destV.equiv;
      m.semantic_route_match = semanticMatch;
      if (semanticMatch) semanticMatches++;
      verdicts.push({ pair: 'origin', ref: m.ref_origin ?? '', model: m.model_origin ?? '', equiv: origV.equiv, reason: origV.reason });
      verdicts.push({ pair: 'dest', ref: m.ref_dest ?? '', model: m.model_dest ?? '', equiv: destV.equiv, reason: destV.reason });
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
