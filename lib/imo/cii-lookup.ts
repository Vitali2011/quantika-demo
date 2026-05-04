import * as fs from 'fs';
import * as path from 'path';
import { getCiiCached, setCiiCached, DEFAULT_CACHE_DIR } from './cii-cache';

export type CiiRating = 'A' | 'B' | 'C' | 'D' | 'E' | 'unknown';

export interface CiiResult {
  imo: string;
  rating: CiiRating;
  year: number;
  source: 'imo-public' | 'llm-fallback' | 'cache';
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

function lookupInDataset(imo: string): CiiRating | null {
  try {
    const datasetPath = path.join(process.cwd(), 'lib', 'sample-data', 'imo', 'cii.json');
    if (!fs.existsSync(datasetPath)) return null;
    const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8')) as {
      year: number;
      records: { imo: string; rating: string }[];
    };
    const record = dataset.records.find(r => r.imo === imo);
    if (record && VALID_RATINGS.has(record.rating)) return record.rating as CiiRating;
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

  // Cache hit
  const cached = getCiiCached(imo, cacheDir);
  if (cached) return { ...cached, source: 'cache' };

  // Static dataset
  const datasetRating = lookupInDataset(imo);
  if (datasetRating !== null) {
    const result: CiiResult = {
      imo,
      rating: datasetRating,
      year: 2025,
      source: 'imo-public',
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
