import * as fs from 'fs';
import * as path from 'path';
import { getCiiCached, setCiiCached, DEFAULT_CACHE_DIR } from './cii-cache';

export type CiiRating = 'A' | 'B' | 'C' | 'D' | 'E' | 'unknown';

export type CiiSource = 'imo-public' | 'estimated' | 'llm-fallback';

export interface CiiResult {
  imo: string;
  rating: CiiRating;
  year: number;
  /**
   * Provenance of the rating:
   *  - 'imo-public'  → real rating from the public dataset (no disclaimer)
   *  - 'estimated'   → derived from the conservative age/type rule (UI shows «оценка»)
   *  - 'llm-fallback'→ AI-estimated when absent from the dataset
   */
  source: CiiSource;
  fetchedAt: string;
}

interface LookupOpts {
  cacheDir?: string;
  /** Override for LLM call — injectable for tests. Returns a raw string (e.g. "D"). */
  callLlm?: (imo: string) => Promise<string>;
}

const VALID_RATINGS = new Set<string>(['A', 'B', 'C', 'D', 'E']);

function parseLlmRating(raw: string): CiiRating {
  const trimmed = raw.trim().toUpperCase();
  // Accept bare single-letter response
  if (VALID_RATINGS.has(trimmed)) return trimmed as CiiRating;
  // Try to extract from JSON {"rating":"C"} style response
  const jsonMatch = trimmed.match(/"RATING"\s*:\s*"([A-E])"/i);
  if (jsonMatch) return jsonMatch[1].toUpperCase() as CiiRating;
  return 'unknown';
}

/** A dataset record carries an optional `source` marker: 'estimated' for ratings
 *  derived from the age/type rule, absent/'imo-public' for real ratings. */
function lookupInDataset(imo: string): { rating: CiiRating; source: 'imo-public' | 'estimated' } | null {
  try {
    const datasetPath = path.join(process.cwd(), 'lib', 'sample-data', 'imo', 'cii.json');
    if (!fs.existsSync(datasetPath)) return null;
    const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8')) as {
      year: number;
      records: { imo: string; rating: string; source?: string }[];
    };
    const record = dataset.records.find(r => r.imo === imo);
    if (record && VALID_RATINGS.has(record.rating)) {
      const source = record.source === 'estimated' ? 'estimated' : 'imo-public';
      return { rating: record.rating as CiiRating, source };
    }
  } catch {
    // Dataset missing or malformed — fall through to LLM
  }
  return null;
}

// wave-γ-1 hardening: cap CII LLM lookup at 30s. CII is an admin-side helper
// for vessels missing from the static dataset; the 85s default is excessive
// and a hung lookup will block a vessel-detail render upstream.
const CII_LLM_TIMEOUT_MS = 30_000;

async function defaultCallLlm(imo: string): Promise<string> {
  const { callAiJson } = await import('@/lib/openai');
  const { AI_MODEL_LIGHT } = await import('@/lib/constants');
  const result = await callAiJson<{ rating: string }>(
    `Provide CII rating A-E for IMO ${imo} for year 2025. JSON only.`,
    'You are a maritime data assistant. Respond only with JSON: {"rating": "<A|B|C|D|E>"}.',
    AI_MODEL_LIGHT,
    { rating: 'unknown' },
    100,
    { timeoutMs: CII_LLM_TIMEOUT_MS },
  );
  return result.rating ?? 'unknown';
}

export async function lookupCii(imo: string, opts: LookupOpts = {}): Promise<CiiResult> {
  const cacheDir = opts.cacheDir ?? DEFAULT_CACHE_DIR;
  const callLlm = opts.callLlm ?? defaultCallLlm;

  if (!imo) {
    return { imo, rating: 'unknown', year: 2025, source: 'imo-public', fetchedAt: new Date().toISOString() };
  }

  // Cache hit — return stored result with its original source intact (preserves 'llm-fallback'
  // so CiiRatingBadge.isEstimated stays true for AI-estimated ratings on revisit).
  const cached = getCiiCached(imo, cacheDir);
  if (cached) return cached;

  // Static dataset (real or estimated — source preserved from the record marker)
  const datasetHit = lookupInDataset(imo);
  if (datasetHit !== null) {
    const result: CiiResult = {
      imo,
      rating: datasetHit.rating,
      year: 2025,
      source: datasetHit.source,
      fetchedAt: new Date().toISOString(),
    };
    setCiiCached(imo, result, cacheDir);
    return result;
  }

  // LLM fallback
  let llmRaw = 'unknown';
  try {
    llmRaw = await callLlm(imo);
  } catch {
    // LLM error — return unknown
  }
  const rating = parseLlmRating(llmRaw);
  const result: CiiResult = {
    imo,
    rating,
    year: 2025,
    source: 'llm-fallback',
    fetchedAt: new Date().toISOString(),
  };
  setCiiCached(imo, result, cacheDir);
  return result;
}
