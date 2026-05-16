#!/usr/bin/env -S npx tsx
/**
 * LLM-judge scorer for classify results.
 *
 * Reads .progonq/results/etms-classify-<round>.json. Deterministic fields
 * (category, urgency, is_unanswered) are taken from the runner. The single
 * semantic field is original_sender_company — judged for legal-name equivalence
 * ("Saudi Bulk Traders Co." vs "Saudi Bulk").
 *
 * Cache: .progonq/cache/judge-cache.json (shared).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/judge-classify.ts \
 *     --results .progonq/results/etms-classify-baseline.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';

const CACHE_PATH = path.resolve(process.cwd(), '.progonq/cache/judge-cache.json');

interface JudgeVerdict { equiv: boolean; reason: string; }

interface ClassifyMatch {
  category_match: boolean;
  urgency_match: boolean;
  is_unanswered_match: boolean;
  ref_company: string | null;
  model_company: string | null;
  semantic_field_match?: Record<string, boolean>;
}

interface RunResult {
  scenario_id: string;
  match: ClassifyMatch;
  [k: string]: unknown;
}

function loadCache(): Map<string, JudgeVerdict> {
  if (!existsSync(CACHE_PATH)) return new Map();
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))));
  } catch { return new Map(); }
}
function saveCache(cache: Map<string, JudgeVerdict>) {
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(cache), null, 2));
}
function pairKey(prefix: string, ref: string | null, model: string | null): string {
  return createHash('sha256').update(JSON.stringify({ prefix, ref, model })).digest('hex').slice(0, 16);
}

const COMPANY_JUDGE = `You decide whether two company-name strings refer to the same legal entity in a chartering email signature context.
Equivalence rules:
- Legal-suffix variants match: "Acme Co." = "Acme Co Ltd" = "Acme Company" only if the BASE name is the same.
- Strict: a missing legal suffix ("Acme" vs "Acme Co. Ltd") = NOT equivalent — the reference is canonical.
- Abbreviations match when the abbreviation is unambiguous: "ETMS" = "Egypt Trade Maritime Services" only when both visible.
- Punctuation / case / extra whitespace — ignore.
- Different brand names = NOT equivalent even if industry matches.
- Null on both = equivalent. Null on one = NOT equivalent.
Reply ONLY with JSON: {"equiv": true|false, "reason": "one short sentence"}`;

async function judgePair(ref: string | null, model: string | null): Promise<JudgeVerdict> {
  if (ref === model) return { equiv: true, reason: 'identical strings' };
  const userMsg = `REF:   ${JSON.stringify(ref)}\nMODEL: ${JSON.stringify(model)}`;
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const raw = await callAiText('CLASSIFY_JUDGE', COMPANY_JUDGE, userMsg, { maxTokens: 200, timeoutMs: 30_000 });
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
  console.error('[judge-cls] parse fail:', { ref, model, err: lastErr });
  return { equiv: false, reason: 'judge parse error — conservative non-match' };
}

async function main() {
  const idx = process.argv.indexOf('--results');
  if (idx < 0) {
    console.error('Usage: judge-classify.ts --results <path/to/results.json>');
    process.exit(1);
  }
  const resultsPath = path.resolve(process.argv[idx + 1]);
  const results: RunResult[] = JSON.parse(readFileSync(resultsPath, 'utf-8'));
  const cache = loadCache();
  let judged = 0, cached = 0;

  for (const r of results) {
    const m = r.match;
    if (!m) continue;

    let companyEquiv = false;
    if (m.ref_company === null && m.model_company === null) {
      companyEquiv = true;
    } else if (m.ref_company !== null && m.model_company !== null && m.ref_company === m.model_company) {
      companyEquiv = true;
    } else {
      const key = pairKey('company:', m.ref_company, m.model_company);
      let v = cache.get(key);
      if (!v) {
        await new Promise((r) => setTimeout(r, 800));
        v = await judgePair(m.ref_company, m.model_company);
        if (!v.reason.startsWith('judge parse error')) {
          cache.set(key, v);
          saveCache(cache);
        }
        judged++;
      } else cached++;
      companyEquiv = v.equiv;
    }

    m.semantic_field_match = {
      category: m.category_match,
      urgency: m.urgency_match,
      is_unanswered: m.is_unanswered_match,
      original_sender_company: companyEquiv,
    };
  }

  writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  const total = results.length;
  const FIELDS = ['category', 'urgency', 'is_unanswered', 'original_sender_company'] as const;
  console.error(`[judge-cls] judged=${judged} cached=${cached}`);
  for (const f of FIELDS) {
    const matches = results.filter((r) => r.match?.semantic_field_match?.[f]).length;
    console.error(`  ${f.padEnd(28)} ${matches}/${total} (${(matches / total * 100).toFixed(1)}%)`);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
