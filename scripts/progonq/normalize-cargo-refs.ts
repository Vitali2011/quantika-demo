#!/usr/bin/env -S npx tsx
/**
 * Normalize cargo_description REFs in corpus scenarios.
 *
 * Standard: Maximalist if-present.
 *   REF MUST include every cargo detail mentioned in the source email:
 *   stowage factor, dimensions, unit weight, per-port/per-mill quantity split,
 *   tier limit, handling notes (no trimming, separation required, etc.),
 *   IMO classification, on-deck stowage permission, packaging form.
 *   If NOT mentioned in the email, MUST NOT be added.
 *
 * Output: .progonq/normalize/cargo-refs-proposed.json with proposed normalized
 * REFs + per-item reason + confidence. NO writes to corpus yet — review first.
 *
 * Usage:
 *   npx tsx --env-file=.env.local /tmp/normalize-cargo-refs.ts [--limit N] [--scenario sid]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';

const CORPUS_DIR = path.resolve(process.cwd(), '.progonq/corpus/etms-parse-cargo');
const OUT_DIR = path.resolve(process.cwd(), '.progonq/normalize');
const OUT_PATH = path.join(OUT_DIR, 'cargo-refs-proposed.json');

const SYSTEM = `You normalize cargo_description ground truth REFs for a shipping cargo inquiry parser eval corpus.

STANDARD — Maximalist if-present:
A correct REF cargo_description for an item MUST include every cargo detail the source email mentions for that specific cargo:
- Stowage factor (e.g. "stowage factor 51-52", "stowage equals deadweight" if STW DWT)
- Dimensions (LxHxW or DxH for bags/coils)
- Unit weight / per-piece weight
- Per-port / per-mill quantity split when the email gives different qty per load port or mill source (e.g. "5000 MT from Tosyali + 2700 MT from Isdemir", "Ko Si Chang 10,000 MT and Kakinada balance")
- Tier / stacking limit when stated
- Handling / hold-treatment notes (no trimming, no pressing, holdwise separation, on-deck permitted, IMO non-IMO classification)
- Multi-grade specifics (grade name + quantity + size range + stowage)
- Packaging form (bagged / break-bulk / in bulk / containers — keep EXACTLY as email says)

A correct REF MUST NOT include details that are NOT in the email — no invented stowage, no hallucinated CBM, no fabricated unit weight.

Format rules:
- Concise noun phrase, NOT a sentence.
- Expand abbreviations: HRC → "Hot Rolled Coils (HRC)", PNO → "Plates Not Otherwise Specified (PNO)", bb → "big bags", stw → "stowage factor".
- Normalize European decimals: "1,25" → "1.25".
- Do NOT include unit notations (ft³/MT, m³/MT) inside cargo_description — units go in separate stowage_factor field.
- Stowage factor in cargo_description = bare number range, e.g. "stowage factor 51-52, without guarantee".
- If email says commodity is TBN/awaiting nomination/not specified, write exactly "Not specified".
- If email mentions no commodity at all (vessel position circular), use empty string "".

You will receive: source email body + current REF cargo_description for ONE item.
Return STRICT JSON with no preamble or markdown:
{
  "normalized_ref": "<the corrected REF following Maximalist if-present>",
  "changed": <true if normalized_ref differs from current REF, else false>,
  "reason": "<short explanation: what was added/removed/kept and why>",
  "confidence": "<high|medium|low>"
}

confidence=low when: email is ambiguous, multiple cargos in one email and item-level mapping unclear, or you're uncertain a detail belongs to THIS item vs another.

CRITICAL — minimal-change discipline:
If the current REF already contains all email-mentioned cargo details (under the Maximalist if-present rule), return it UNCHANGED — set changed=false and normalized_ref=current_ref exactly. Do NOT make cosmetic changes:
- Do NOT change capitalization unless the current REF has a clear case error
- Do NOT expand short forms like "max" → "maximum" when both are clear
- Do NOT rephrase wording for style
- Do NOT add punctuation/spacing tweaks
ONLY change the REF when there is SUBSTANTIVE information difference: adding an email-mentioned detail that's missing, or removing a detail that's NOT in the email (hallucination).`;

interface Proposed {
  scenario_id: string;
  item_index: number;
  current_ref: string;
  normalized_ref: string;
  changed: boolean;
  reason: string;
  confidence: string;
  error?: string;
}

async function normalizeOne(email: string, currentRef: string, itemIdx: number, totalItems: number): Promise<Omit<Proposed, 'scenario_id' | 'item_index'>> {
  const user = `=== SOURCE EMAIL ===\n${email.slice(0, 6000)}\n\n=== CURRENT REF (item ${itemIdx + 1} of ${totalItems}) ===\n${currentRef}\n\nReturn the JSON.`;
  let lastErr = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const text = await callAiText('JUDGE', SYSTEM, user, { temperature: 0 });
      // Strip code fences if present
      let body = text.trim();
      body = body.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
      // raw_decode-like: find first { and parse
      const idx = body.indexOf('{');
      if (idx === -1) throw new Error('no json object found');
      // Try parsing greedily from idx; if fails, find last } and try
      const candidate = body.slice(idx);
      let parsed: any;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        // Truncate to last balanced brace
        let depth = 0, end = -1;
        for (let i = 0; i < candidate.length; i++) {
          if (candidate[i] === '{') depth++;
          else if (candidate[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end === -1) throw new Error('unbalanced json');
        parsed = JSON.parse(candidate.slice(0, end + 1));
      }
      return {
        current_ref: currentRef,
        normalized_ref: String(parsed.normalized_ref ?? ''),
        changed: Boolean(parsed.changed),
        reason: String(parsed.reason ?? ''),
        confidence: String(parsed.confidence ?? 'medium'),
      };
    } catch (e: any) {
      lastErr = String(e?.message ?? e).slice(0, 200);
      if (attempt < 4) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  return {
    current_ref: currentRef,
    normalized_ref: currentRef,
    changed: false,
    reason: '',
    confidence: 'low',
    error: lastErr,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Resume
  const existing: Proposed[] = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf-8')) : [];
  const done = new Set(existing.map(p => `${p.scenario_id}#${p.item_index}`));

  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : Infinity;
  const sidIdx = process.argv.indexOf('--scenario');
  const onlySid = sidIdx >= 0 ? process.argv[sidIdx + 1] : null;

  const files = readdirSync(CORPUS_DIR).filter(f => f.endsWith('.json')).sort();
  const proposed: Proposed[] = [...existing];

  let count = 0;
  for (const file of files) {
    if (count >= limit) break;
    const sc = JSON.parse(readFileSync(path.join(CORPUS_DIR, file), 'utf-8'));
    if (onlySid && sc.id !== onlySid) continue;
    const items = (sc.reference_output?.items ?? []) as any[];
    if (!items.length) continue;
    const email = `Subject: ${sc.input.subject}\nFrom: ${sc.input.from}\nDate: ${sc.input.date}\n\n${sc.input.body}`;
    for (let i = 0; i < items.length; i++) {
      const key = `${sc.id}#${i}`;
      if (done.has(key)) continue;
      const currentRef = items[i]?.cargo_description?.value ?? '';
      if (currentRef === '' || currentRef == null) {
        // Skip empty REFs — keep as is
        proposed.push({ scenario_id: sc.id, item_index: i, current_ref: '', normalized_ref: '', changed: false, reason: 'skip: empty REF', confidence: 'high' });
        done.add(key);
        continue;
      }
      const result = await normalizeOne(email, String(currentRef), i, items.length);
      proposed.push({ scenario_id: sc.id, item_index: i, ...result });
      done.add(key);
      count++;
      writeFileSync(OUT_PATH, JSON.stringify(proposed, null, 2));
      const mark = result.error ? 'ERR' : (result.changed ? 'CHG' : 'sam');
      console.error(`[${mark}] ${sc.id}#${i} conf=${result.confidence}${result.error ? ` err=${result.error}` : ''}`);
      // small pacing
      await new Promise(r => setTimeout(r, 250));
    }
  }

  const changed = proposed.filter(p => p.changed).length;
  const errors = proposed.filter(p => p.error).length;
  console.error(`\nDONE: total=${proposed.length} changed=${changed} errors=${errors}`);
  console.error(`Output: ${OUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
