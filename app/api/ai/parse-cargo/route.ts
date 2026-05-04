import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson, LLMTimeoutError } from '@/lib/openai';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { CargoType, Email, ParsedCargo, Range } from '@/lib/types';
import { toConfidence, extractNum } from '@/lib/parsing-utils';
import { calibrateAll } from '@/lib/validation/confidence-calibration';
import { applyCargoRateFallback, applyCargoTypeFallback } from '@/lib/parsing/cargo-rate-fallback';
import { buildProcessedEmails } from '@/lib/classification-service';
import pLimit from 'p-limit';

interface RawCargoItem {
  origin_port?: unknown;
  origin_country?: string | null;
  destination_port?: unknown;
  destination_country?: string | null;
  cargo_description?: unknown;
  weight_mt?: unknown;
  weight_mt_min?: number | null;
  weight_mt_max?: number | null;
  volume_cbm?: number | null;
  dimensions?: string | null;
  cargo_type?: string;
  container_type?: string | null;
  quantity?: number | null;
  incoterms?: string | null;
  preferred_dates?: unknown;
  laycan?: string | null;
  loading_rate?: string | null;
  discharge_rate?: string | null;
  commission_percent?: number | string | null;
  commission_terms?: string | null;
  special_requirements?: string | null;
  stowage_factor?: string | null;
  missing_info?: string[];
  items?: RawCargoItem[];
}

/** Extract plain string from a value that may be a ConfidenceField object or a plain string */
function extractStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value) || null;
  return String(v) || null;
}

// βf-11: Cloudflare proxy enforces a hard 100s edge timeout (524). Cap our
// route well below it so the runtime can still emit a clean 200 fallback
// instead of bubbling a 524 to the browser.
export const maxDuration = 55;

// βf-11: Per-email body cap before we hand the prompt to the LLM. Real-inbox
// emails sometimes carry quoted threads/footers in the 50k–100k char range,
// which pushes the prompt over cliproxy/gpt-5.5 budgets and stalls the route.
// 12 000 chars ≈ 3 000 tokens — comfortably under the model's working window
// while still preserving the lead paragraph + first reply where intent lives.
export const MAX_EMAIL_BODY_CHARS = 12_000;

// βf-11: Per-email LLM timeout. We race callAiJson against this; on timeout we
// fall back to regex-only enrichment (applyCargoRateFallback / TypeFallback)
// so the route returns 200 with whatever we can salvage instead of stalling
// past maxDuration.
export const LLM_TIMEOUT_MS = 45_000;

/**
 * wave-γ-3 (B1): per-route concurrency cap on parallel LLM calls.
 * Was 3 — for a 13-email demo session that cost ~5 sequential rounds × 20s
 * each, hitting Cloudflare 524 stably. Bumped to 8 → ceil(13/8)=2 rounds.
 */
export const PARSE_CARGO_CONCURRENCY = 8;

/**
 * wave-γ-3 (B1): retry an LLM call when cliproxy returns 429 (rate limit).
 * Higher pLimit concurrency means more chance of brief upstream throttling;
 * a jittered backoff retry absorbs the blip without surfacing it as a parse
 * failure. Non-429 errors propagate immediately so real failures stay loud.
 */
export interface Retry429Options {
  maxRetries?: number;
  baseDelayMs?: number;
}
export async function withRetry429<T>(
  fn: () => Promise<T>,
  opts: Retry429Options = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 200;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number } | null)?.status;
      const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
      const isRateLimit = status === 429 || /\b429\b|rate.?limit/i.test(msg);
      if (!isRateLimit || attempt === maxRetries) throw err;
      // Jittered exponential backoff: baseDelay × 2^attempt × (1..2 random).
      const delayMs = baseDelayMs * Math.pow(2, attempt) * (1 + Math.random());
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

/** Truncate raw email body to keep prompts within model budget. */
function truncateBody(body: string): string {
  if (body.length <= MAX_EMAIL_BODY_CHARS) return body;
  return body.slice(0, MAX_EMAIL_BODY_CHARS) + '\n[truncated]';
}

/** Build user prompt strings for a list of cargo inquiry emails. */
function buildCargoPrompts(emails: Email[]): string[] {
  return emails.map(
    email =>
      `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${truncateBody(email.body)}`
  );
}

/** Race a promise against a timeout. Returns `null` on timeout instead of throwing. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Parse a raw AI JSON response string into ParsedCargo records.
 * Returns [] on malformed JSON or empty items.
 */
function parseCargoAIResponse(raw: string, emailId: string): ParsedCargo[] {
  let result: RawCargoItem;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (!cleaned) return [];
    result = JSON.parse(cleaned) as RawCargoItem;
  } catch {
    return [];
  }

  const items = Array.isArray(result.items) ? result.items : [result];
  const parsed: ParsedCargo[] = [];

  items.forEach((item, idx) => {
    parsed.push(calibrateAll({
      emailId,
      itemIndex: idx,
      originPort: toConfidence<string>(item.origin_port),
      originCountry: extractStr(item.origin_country),
      destinationPort: toConfidence<string>(item.destination_port),
      destinationCountry: extractStr(item.destination_country),
      cargoDescription: toConfidence<string>(item.cargo_description),
      weightMt: toConfidence<number>(item.weight_mt),
      weightMtMin: extractNum(item.weight_mt_min),
      weightMtMax: extractNum(item.weight_mt_max),
      // extractNum is NaN-safe and preserves a legitimate zero (unlike `x || null`,
      // which nullifies 0). Prior commit introduced a 0-commission bug by using the
      // antipattern — see ROADMAP_MVP.md W1.8.
      volumeCbm: extractNum(item.volume_cbm),
      dimensions: extractStr(item.dimensions),
      cargoType: (() => {
        const ct = item.cargo_type;
        if (!ct) return 'OTHER' as CargoType;
        if (typeof ct === 'object' && 'value' in ct) return (String((ct as { value: unknown }).value) || 'OTHER') as CargoType;
        return (String(ct) || 'OTHER') as CargoType;
      })(),
      containerType: extractStr(item.container_type),
      quantity: (() => {
        const wMin = extractNum(item.weight_mt_min);
        const wMax = extractNum(item.weight_mt_max);
        if (wMin !== null && wMax !== null && wMin !== wMax) {
          return { min: wMin, max: wMax } as Range<number>;
        }
        return extractNum(item.quantity);
      })(),
      incoterms: extractStr(item.incoterms),
      preferredDates: toConfidence<string>(item.preferred_dates),
      laycan: extractStr(item.laycan),
      loadingRate: extractStr(item.loading_rate),
      dischargeRate: extractStr(item.discharge_rate),
      commissionPercent: extractNum(item.commission_percent),
      commissionTerms: extractStr(item.commission_terms),
      specialRequirements: extractStr(item.special_requirements),
      stowageFactor: extractStr(item.stowage_factor),
      missingInfo: Array.isArray(item.missing_info) ? item.missing_info : [],
    }) as ParsedCargo);
  });

  return parsed;
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session, sessionId } = authResult;

  const cargoInquiryIds = session.classifications
    .filter(c => c.category === 'CARGO_INQUIRY')
    .map(c => c.emailId);

  const cargoEmails = session.emails.filter(e => cargoInquiryIds.includes(e.id));

  if (cargoEmails.length === 0) {
    updateSession(sessionId, { parsedCargos: [] });
    return NextResponse.json({ count: 0 });
  }

  const allParsed: ParsedCargo[] = [];
  const limit = pLimit(PARSE_CARGO_CONCURRENCY);
  const prompts = buildCargoPrompts(cargoEmails);

  await Promise.all(
    cargoEmails.map((email, i) => limit(async () => {
      // βf-11: race the LLM call against LLM_TIMEOUT_MS. On timeout we fall
      // back to regex enrichment of an empty cargo so the route still returns
      // 200 instead of letting the request hang past maxDuration → 524.
      // γ-1: pass timeoutMs into callAiJson so the underlying AbortController
      // actually cancels the upstream stream (was: only outer race resolved
      // null while the LLM kept consuming resources in the background).
      // γ-3 (B1): wrap in withRetry429 so the higher pLimit(8) concurrency
      // doesn't translate cliproxy 429 blips into permanent failures.
      let result: RawCargoItem | null;
      try {
        result = await withTimeout(
          withRetry429(() =>
            callAiJson<RawCargoItem>(
              prompts[i],
              CARGO_INQUIRY_PARSER_PROMPT,
              AI_MODEL_LIGHT,
              { items: [] },
              16000,
              { timeoutMs: LLM_TIMEOUT_MS },
            ),
          ),
          LLM_TIMEOUT_MS,
        );
      } catch (err) {
        // LLMTimeoutError from the inner abort — same outcome as withTimeout race.
        if (err instanceof LLMTimeoutError) {
          result = null;
        } else {
          throw err;
        }
      }
      const items = result === null
        ? [] // LLM timed out — emit nothing rather than a half-parsed record.
        : parseCargoAIResponse(JSON.stringify(result), email.id);
      // Apply regex fallbacks: populate rates/cargoType that LLM missed
      const enriched = items
        .map(c => applyCargoRateFallback(c, email.body))
        .map(c => applyCargoTypeFallback(c));
      allParsed.push(...enriched);
    }))
  );

  // Recompute processedEmails so dashboard staleness reflects the laycan
  // we just extracted. Without this, classify-time fallback (+5d) leaves
  // every CARGO_INQUIRY marked stale within a week.
  const processedEmails = buildProcessedEmails(
    session.emails,
    session.classifications,
    allParsed,
    session.parsedVessels,
  );
  updateSession(sessionId, { parsedCargos: allParsed, processedEmails });
  return NextResponse.json({ count: allParsed.length });
}
