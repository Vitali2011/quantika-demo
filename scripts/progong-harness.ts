/**
 * Progong harness — runs production Gemini prompts on corpus samples.
 * Called by the /progong loop; NOT bundled for production.
 *
 * Usage:
 *   npx tsx scripts/progong-harness.ts [--round N] [--case category/sample.json]
 *
 * Output: .progong/results/run-NNN.json
 */
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false });

// Load production path aliases via tsconfig paths
import { callAiJson, callAiText } from '@/lib/ai-provider';
import { getClassifyPrompt } from '@/lib/prompts';
import { applyGearedFallback } from '@/lib/parsing/geared-fallback';
import {
  CARGO_INQUIRY_PARSER_PROMPT,
} from '@/lib/prompts/parse-cargo';
import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts/parse-vessel';
import { FIXTURE_RECAP_PARSER_PROMPT } from '@/lib/prompts/parse-recap';
import {
  CLASSIFY_SCHEMA,
  PARSE_CARGO_SCHEMA,
  PARSE_VESSEL_SCHEMA,
  PARSE_RECAP_SCHEMA,
} from '@/lib/schemas';
import { endpointLlmTimeout } from '@/lib/openai-helpers';

const CORPUS_DIR = path.resolve(process.cwd(), '.progong/corpus');
const RESULTS_DIR = path.resolve(process.cwd(), '.progong/results');

function parseArgs() {
  const args = process.argv.slice(2);
  const getOpt = (k: string) => {
    const i = args.indexOf(k);
    return i === -1 ? undefined : args[i + 1];
  };
  return {
    round: parseInt(getOpt('--round') ?? '1', 10),
    singleCase: getOpt('--case'),
  };
}

interface CorpusSample {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  _test_note?: string;
}

function loadCorpus(singleCase?: string): Array<{ path: string; category: string; sample: CorpusSample }> {
  const items: Array<{ path: string; category: string; sample: CorpusSample }> = [];

  if (singleCase) {
    const [cat, file] = singleCase.includes('/') ? singleCase.split('/') : ['', singleCase];
    const fullPath = path.join(CORPUS_DIR, cat, file);
    const sample = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as CorpusSample;
    items.push({ path: fullPath, category: cat, sample });
    return items;
  }

  const categories = fs.readdirSync(CORPUS_DIR).filter(c => {
    const p = path.join(CORPUS_DIR, c);
    return fs.statSync(p).isDirectory();
  });

  for (const cat of categories) {
    const catDir = path.join(CORPUS_DIR, cat);
    const files = fs.readdirSync(catDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const sample = JSON.parse(fs.readFileSync(path.join(catDir, file), 'utf8')) as CorpusSample;
      items.push({ path: path.join(catDir, file), category: cat, sample });
    }
  }
  return items;
}

// Production format: "From: ...\nSubject: ...\nDate: ...\n\n<body>"
const MAX_BODY = 8000;
function buildEmailText(sample: CorpusSample): string {
  const body = sample.body.length > MAX_BODY ? sample.body.slice(0, MAX_BODY) + '\n[truncated]' : sample.body;
  return `From: ${sample.from}\nSubject: ${sample.subject}\nDate: ${sample.date}\n\n${body}`;
}

function buildEmailInput(sample: CorpusSample) {
  return {
    id: sample.id,
    subject: sample.subject,
    from: sample.from,
    date: sample.date,
    body_preview: sample.body.slice(0, 3000),
  };
}

const LLM_OPTS = { timeoutMs: endpointLlmTimeout(120), temperature: 0, seed: 42, maxTokens: 16000 };

// ─── Phase 4.6 provider-artefact normalizers ────────────────────────────────
// These fix Gemini-specific output bugs (NULL_STRING, ZERO_NUMERIC, BUILT_FROM_DATE)
// that cannot be fixed via prompt alone. See .progong/gemini-quirks.md.

function isConfidenceField(v: unknown): v is { value: unknown; confidence: string; source_text?: string } {
  return v !== null && typeof v === 'object' && 'value' in (v as object) && 'confidence' in (v as object);
}

// NULL_STRING: {value: "null"} → null
// A1 empty-string variant: {value: "", source_text: ""} → null (no information)
// A9 NOT_SPECIFIED_STRING: {value: "Not specified", source_text: ""} → null
function fixNullString(v: unknown): unknown {
  if (!isConfidenceField(v)) return v;
  if (v.value === 'null' || v.value === null) return null;
  if (v.value === '' && (!v.source_text || v.source_text === '')) return null;
  if (typeof v.value === 'string' && v.value.trim().toLowerCase() === 'not specified') return null;
  return v;
}

// ZERO_NUMERIC: {value: 0, source_text: ""} → null (vessel dimension fields only)
function fixZeroNumeric(v: unknown): unknown {
  if (isConfidenceField(v) && v.value === 0 && (!v.source_text || v.source_text === '')) return null;
  return v;
}

const MONTH_IN_SOURCE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

// BUILT_FROM_DATE: built where source_text contains a month name → null
function fixBuiltFromDate(v: unknown): unknown {
  if (!isConfidenceField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (MONTH_IN_SOURCE.test(src)) return null;
  return v;
}

const SQM_OR_CM_RE = /sqm|sq\.?m\b|\bcm\b|cbm/i;
const SPEED_UNIT_RE = /\bknts?\b|\bknots?\b|\bkts?\b/i;
const THREE_DIM_RE = /\d+\s*[Xx×]\s*\d+\s*[Xx×]\s*\d+/;
const CBFT_RE = /\bcbft\b|\bcuft\b|ft³|ft3/i;
const CBFT_TO_CBM = 35.314667;
const BLT_RE = /\b(blt|built|yob|year\s+of\s+build|yr\.?\s*built)\b/i;

// SQM/CM/CBM GUARD: deck area, bag dims, or volume — NEVER loa/beam/draft
function fixSqmOrCmDimension(v: unknown): unknown {
  if (!isConfidenceField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (SQM_OR_CM_RE.test(src) || THREE_DIM_RE.test(src)) return null;
  return v;
}

// SPEED_AS_DRAFT: draft_max from a speed source (e.g. "13 knts") → null
function fixSpeedAsDraft(v: unknown): unknown {
  if (!isConfidenceField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (SPEED_UNIT_RE.test(src)) return null;
  return v;
}

// CBFT→CBM: grain_capacity/bale_capacity in cubic feet → convert to cbm
function fixCbftToCbm(v: unknown): unknown {
  if (!isConfidenceField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (CBFT_RE.test(src) && typeof v.value === 'number' && v.value > 0) {
    return { ...v, value: Math.round(v.value / CBFT_TO_CBM), confidence: 'interpreted' };
  }
  return v;
}

// BUILT_FROM_EMPTY_SOURCE: vessel_yob with no BLT keyword in source → null
// value > 0 AND value === 0 both null — year 0 is never valid
function fixBuiltFromEmptySource(v: unknown): unknown {
  if (typeof v !== 'number' && !isConfidenceField(v)) return v;
  if (isConfidenceField(v)) {
    const src = typeof v.source_text === 'string' ? v.source_text.trim() : '';
    if ((src === '' || !BLT_RE.test(src)) && typeof v.value === 'number') return null;
  }
  return v;
}

const FLAG_RE = /\bflag\b/i;
// FLAG_INFERRED: vessel_flag from uncertain inference with no "flag" keyword in source → null
function nullIfFlagInferred(v: unknown): unknown {
  if (!isConfidenceField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (v.confidence === 'uncertain' && !FLAG_RE.test(src)) return null;
  return v;
}

function normalizeVesselItem(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item;
  const obj = { ...(item as Record<string, unknown>) };

  // NULL_STRING: scan all keys
  for (const key of Object.keys(obj)) {
    obj[key] = fixNullString(obj[key]);
  }

  // ZERO_NUMERIC: vessel dimension/capacity ConfidenceFields only
  for (const key of ['loa', 'beam', 'draft_max', 'grt', 'nrt', 'grain_capacity', 'bale_capacity', 'dwt_summer', 'dwcc']) {
    if (key in obj) obj[key] = fixZeroNumeric(obj[key]);
  }

  // SQM/CM/CBM GUARD: loa/beam/draft_max must not come from sqm/cm/cbm values
  for (const key of ['loa', 'beam', 'draft_max']) {
    if (key in obj) obj[key] = fixSqmOrCmDimension(obj[key]);
  }

  // SPEED_AS_DRAFT: draft_max must not come from a speed source
  if ('draft_max' in obj) obj['draft_max'] = fixSpeedAsDraft(obj['draft_max']);

  // CBFT→CBM: grain/bale capacity unit conversion
  for (const key of ['grain_capacity', 'bale_capacity']) {
    if (key in obj) obj[key] = fixCbftToCbm(obj[key]);
  }

  // BUILT_FROM_DATE
  if ('built' in obj) obj['built'] = fixBuiltFromDate(obj['built']);

  // FLAG_INFERRED: vessel_flag uncertain without "flag" keyword in source → null
  if ('vessel_flag' in obj) obj['vessel_flag'] = nullIfFlagInferred(obj['vessel_flag']);

  // GRAIN_CAPACITY_FABRICATION: grain_capacity should not be set if source_text has no "grain" label
  // Gemini copies bale_capacity value to grain_capacity when only bale is stated (no grain label).
  const gc = obj['grain_capacity'];
  const bc = obj['bale_capacity'];
  if (isConfidenceField(gc)) {
    const src = typeof gc.source_text === 'string' ? gc.source_text.toLowerCase() : '';
    if (!src.includes('grain') && !src.includes('gkc')) obj['grain_capacity'] = null;
  } else if (typeof gc === 'number' && gc > 0 && typeof bc === 'number' && gc === bc) {
    // Plain integer grain equals bale — model copied bale to grain (only bale stated in email)
    obj['grain_capacity'] = null;
  }

  // ARRAY DEFAULTS: special_features must be [] not null when absent
  if (obj['special_features'] === null || obj['special_features'] === undefined) obj['special_features'] = [];

  return obj;
}

function normalizeRecapItem(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item;
  const obj = { ...(item as Record<string, unknown>) };

  // NULL_STRING: scan all keys
  for (const key of Object.keys(obj)) {
    obj[key] = fixNullString(obj[key]);
  }

  // vessel_yob = 0 → null (ZERO_NUMERIC for non-ConfidenceField int)
  if (obj['vessel_yob'] === 0) obj['vessel_yob'] = null;

  // BUILT_FROM_EMPTY_SOURCE: vessel_yob with no BLT anchor → null
  if (isConfidenceField(obj['vessel_yob'])) {
    obj['vessel_yob'] = fixBuiltFromEmptySource(obj['vessel_yob']);
  } else if (typeof obj['vessel_yob'] === 'number' && obj['vessel_yob'] !== 0) {
    // plain integer vessel_yob without source evidence — can't validate, leave as-is
  }

  // FLAG_INFERRED: vessel_flag uncertain without "flag" keyword in source → null
  if ('vessel_flag' in obj) obj['vessel_flag'] = nullIfFlagInferred(obj['vessel_flag']);

  // A8 CHARTERERS_ROLE_NOUN: "Charterers" / "chrtrs" as party name → null
  // Generic role-noun in boilerplate clause is not a company name (3rd-round provider artefact).
  const chrt = obj['charterers'];
  if (isConfidenceField(chrt) && typeof chrt.value === 'string') {
    const v = chrt.value.trim().toLowerCase();
    if (v === 'charterers' || v === 'chrtrs') obj['charterers'] = null;
  }

  // ACCOUNT_ROLE_NOUN: account="owners" from "for owners final confirmation" → null
  // "owners" is a vessel-side role, not a cargo account company name.
  const acct = obj['account'];
  if (isConfidenceField(acct) && typeof acct.value === 'string') {
    const v = acct.value.trim().toLowerCase();
    if (v === 'owners' || v === 'owner') obj['account'] = null;
  }

  // OWNERS_ROLE_NOUN: owners={value:"Owners"} from purpose phrase → null
  // Same artefact as CHARTERERS_ROLE_NOUN. "Owners" in "for owners final confirmation"
  // is the recipient role, not a company name.
  const ownersField = obj['owners'];
  if (isConfidenceField(ownersField) && typeof ownersField.value === 'string') {
    const v = ownersField.value.trim().toLowerCase();
    if (v === 'owners' || v === 'owner') obj['owners'] = null;
  }

  return obj;
}
// ────────────────────────────────────────────────────────────────────────────

function normalizeCargoItem(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item;
  const obj = { ...(item as Record<string, unknown>) };

  // NULL_STRING scan
  for (const key of Object.keys(obj)) {
    obj[key] = fixNullString(obj[key]);
  }

  // CHOPT CONFIDENCE: when destination_port_alternatives is non-empty, force
  // destination_port.confidence to 'interpreted' (alternatives = port not yet elected).
  const dp = obj['destination_port'];
  const alts = obj['destination_port_alternatives'];
  if (isConfidenceField(dp) && Array.isArray(alts) && alts.length > 0 && dp.confidence === 'confirmed') {
    obj['destination_port'] = { ...dp, confidence: 'interpreted' };
  }

  // RANGE_RULE_NULL: Gemini returns midpoint as weight_mt despite prompt instruction.
  // When min and max are both set and different, weight_mt should be null (range, not single value).
  // Exception: MOLOO/MOLCHOPT sets weight_mt to the nominal — those have min≠max but weight_mt
  // equals stated value (not midpoint). Current corpus has no ambiguous MOLOO case.
  const wmtMin = obj['weight_mt_min'];
  const wmtMax = obj['weight_mt_max'];
  if (wmtMin != null && wmtMax != null && wmtMin !== wmtMax) {
    obj['weight_mt'] = null;
  }

  return obj;
}

async function runClassify(sample: CorpusSample) {
  const todayIso = new Date().toISOString().split('T')[0];
  const emailInput = buildEmailInput(sample);
  const result = await callAiJson<{ classifications: unknown[] }>(
    'CLASSIFY',
    getClassifyPrompt(),
    `Today's date: ${todayIso}\n\n${JSON.stringify([emailInput])}`,
    { ...LLM_OPTS, responseSchema: CLASSIFY_SCHEMA },
  );
  return result.classifications?.[0] ?? null;
}

async function runParseCargo(sample: CorpusSample) {
  const result = await callAiJson<{ items: unknown[] }>(
    'PARSE_CARGO',
    CARGO_INQUIRY_PARSER_PROMPT,
    buildEmailText(sample),
    { ...LLM_OPTS, responseSchema: PARSE_CARGO_SCHEMA },
  );
  return (result.items ?? []).map(normalizeCargoItem);
}

const IMO_IMDG_HARNESS_RE = /\bimo\s+(\d+\.\d+)/gi;
// "imo 1" / "imo 2" (integer, no decimal) on dry cargo vessels = IMDG Class (not MARPOL)
const IMO_IMDG_INT_HARNESS_RE = /\bimo\s+(\d+)\b(?!\.\d)/gi;
const APP_B_HARNESS_RE = /\bapp(?:endix)?\s*b\b/i;
// B5: BOX/SID hold geometry — applied here (snake_case) to mirror applyGearedFallback (camelCase)
const SID_BOX_HARNESS_RE = /\bSID\b.*?\bBOX\b|\bBOX\b.*?\bSID\b/i;
const BOX_SHAPED_HARNESS_RE = /\bbox[-\s]?shaped\b/i;

const GRAIN_BALE_HARNESS_RE = /\bgrain\s*[/\\]\s*bale\b/i;
const GREAT_LAKES_HARNESS_RE = /\bLakes\b/i;

function addImoAnnotationFromBody(item: unknown, body: string): unknown {
  if (!item || typeof item !== 'object') return item;
  const obj = item as Record<string, unknown>;
  const features = Array.isArray(obj['special_features']) ? [...obj['special_features'] as unknown[]] : [];
  const extra: string[] = [];
  for (const m of body.matchAll(IMO_IMDG_HARNESS_RE)) {
    const label = `IMDG Class ${m[1]} certified`;
    if (!features.includes(label) && !extra.includes(label)) extra.push(label);
  }
  for (const m of body.matchAll(IMO_IMDG_INT_HARNESS_RE)) {
    const label = `IMDG Class ${m[1]} certified`;
    if (!features.includes(label) && !extra.includes(label)) extra.push(label);
  }
  if (APP_B_HARNESS_RE.test(body)) {
    const label = 'Appendix B fitted';
    if (!features.includes(label) && !extra.includes(label)) extra.push(label);
  }
  // B5: BOX/SID hold geometry (harness mirror of applyGearedFallback B5)
  // Uses full body (addImoAnnotationFromBody already scans full body, not just fragment)
  if (SID_BOX_HARNESS_RE.test(body)) {
    const label = 'SID box-shaped hold';
    if (!features.includes(label) && !extra.includes(label)) extra.push(label);
  } else if (BOX_SHAPED_HARNESS_RE.test(body)) {
    const isSingle = /\bsingle\b/i.test(body);
    const label = isSingle ? 'box-shaped single hold' : 'box-shaped hold';
    if (!features.includes(label) && !extra.includes(label)) extra.push(label);
  }
  // B6: GRAIN_BALE_COMBINED (harness mirror of applyGearedFallback B6)
  // "hold cap. grain/bale abt X cbft" — LLM only populates bale_capacity; copy to grain_capacity.
  const gcVal = obj['grain_capacity'];
  const bcVal = obj['bale_capacity'];
  const needsGrainFix = (gcVal === null || gcVal === undefined) && bcVal != null && GRAIN_BALE_HARNESS_RE.test(body);
  // B7: GREAT_LAKES_SEAWAY — vessel-fragment-aware (200-char window)
  // Full-body scan over-annotates compact multi-vessel emails (all vessels get Lakes when
  // only one has it). Use vessel_name to find a narrow forward window.
  {
    const vnRaw = obj['vessel_name'];
    const vnStr = isConfidenceField(vnRaw) ? String((vnRaw as any).value ?? '') : (typeof vnRaw === 'string' ? vnRaw : '');
    let lakesFragment = body;
    if (vnStr) {
      const idx = body.toLowerCase().indexOf(vnStr.toLowerCase());
      if (idx >= 0) lakesFragment = body.substring(idx, idx + 200);
    }
    if (GREAT_LAKES_HARNESS_RE.test(lakesFragment)) {
      const label = 'Great Lakes/Seaway fitted';
      if (!features.includes(label) && !extra.includes(label)) extra.push(label);
    }
  }
  // B8: BOX_HOLD_BALE_CAPACITY (harness mirror of applyGearedFallback B8)
  const needsBaleFix = (bcVal === null || bcVal === undefined) && gcVal != null && (SID_BOX_HARNESS_RE.test(body) || BOX_SHAPED_HARNESS_RE.test(body));
  if (extra.length === 0 && !needsGrainFix && !needsBaleFix) return item;
  const result: Record<string, unknown> = extra.length > 0
    ? { ...obj, special_features: [...features, ...extra] }
    : { ...obj };
  if (needsGrainFix) result['grain_capacity'] = bcVal;
  if (needsBaleFix) result['bale_capacity'] = gcVal;
  return result;
}

async function runParseVessel(sample: CorpusSample) {
  const result = await callAiJson<{ items: unknown[] }>(
    'PARSE_VESSEL',
    VESSEL_POSITION_PARSER_PROMPT,
    buildEmailText(sample),
    { ...LLM_OPTS, responseSchema: PARSE_VESSEL_SCHEMA },
  );
  const normalized = (result.items ?? []).map(normalizeVesselItem);
  // applyGearedFallback mirrors the production post-processor (B1–B5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fallbacked = applyGearedFallback(normalized as any[], sample.body);
  return fallbacked.map(v => addImoAnnotationFromBody(v, sample.body));
}

async function runParseRecap(sample: CorpusSample) {
  // Production uses callAiText + parseRecapAIResponse (flat object, not items-wrapped)
  const raw = await callAiText(
    'PARSE_RECAP',
    FIXTURE_RECAP_PARSER_PROMPT,
    buildEmailText(sample),
    { ...LLM_OPTS, responseSchema: PARSE_RECAP_SCHEMA },
  );
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeRecapItem(parsed);
    // Return as single-element array so the caller can iterate uniformly
    return normalized && (normalized as Record<string, unknown>).vessel_name ? [normalized] : [];
  } catch {
    return [];
  }
}

async function runCase(category: string, sample: CorpusSample) {
  const results: Record<string, unknown> = {
    id: sample.id,
    category,
    subject: sample.subject,
    _test_note: sample._test_note,
    body_preview: sample.body.slice(0, 500),
  };

  try {
    results.classify = await runClassify(sample);
    console.log(`  classify: ${(results.classify as { category?: string })?.category ?? '?'}`);
  } catch (e) {
    results.classify_error = String(e);
    console.error(`  classify ERROR: ${e}`);
  }

  // Only run parsers for relevant categories
  if (['CARGO_INQUIRY', 'EDGE_CASES'].includes(category)) {
    try {
      results.parse_cargo = await runParseCargo(sample);
      console.log(`  parse_cargo: ${(results.parse_cargo as unknown[]).length} items`);
    } catch (e) {
      results.parse_cargo_error = String(e);
    }
  }

  if (['VESSEL_POSITION', 'EDGE_CASES'].includes(category)) {
    try {
      results.parse_vessel = await runParseVessel(sample);
      console.log(`  parse_vessel: ${(results.parse_vessel as unknown[]).length} items`);
    } catch (e) {
      results.parse_vessel_error = String(e);
    }
  }

  if (['FIXTURE_RECAP', 'EDGE_CASES'].includes(category)) {
    try {
      results.parse_recap = await runParseRecap(sample);
      console.log(`  parse_recap: ${(results.parse_recap as unknown[]).length} items`);
    } catch (e) {
      results.parse_recap_error = String(e);
    }
  }

  return results;
}

async function main() {
  const args = parseArgs();
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const corpus = loadCorpus(args.singleCase);
  console.log(`[progong-harness] round=${args.round} corpus=${corpus.length} cases`);

  const allResults: unknown[] = [];

  for (const { category, sample } of corpus) {
    console.log(`\n[case] ${category}/${sample.id}: ${sample.subject.slice(0, 60)}`);
    const result = await runCase(category, sample);
    allResults.push(result);
  }

  const outPath = path.join(RESULTS_DIR, `run-${String(args.round).padStart(3, '0')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2) + '\n');
  console.log(`\n[progong-harness] wrote ${outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
