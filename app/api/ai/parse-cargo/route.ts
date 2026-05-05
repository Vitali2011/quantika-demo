import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson as callAiJsonShim } from '@/lib/ai-provider';
import { LLMTimeoutError } from '@/lib/openai';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts';
import {
  MAX_EMAIL_BODY_CHARS,
  LLM_TIMEOUT_MS,
  PARSE_CARGO_CONCURRENCY,
  withRetry429,
} from '@/lib/parse-cargo-helpers';
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

  // wave-γ-3-demo: demo guests get pre-seeded cargoes — skip live LLM entirely.
  if (session.isSampleData === true && session.parsedCargos.length > 0) {
    return NextResponse.json({ count: session.parsedCargos.length, cached: true });
  }

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
      // γv-02: route through ai-provider shim (PARSE_CARGO_PROVIDER env).
      //   Default: gemini-2.5-flash; rollback: PARSE_CARGO_PROVIDER=openai.
      //   PARSE_CARGO_GEMINI_MODEL overrides the Gemini model for this scope.
      let result: RawCargoItem | null;
      try {
        result = await withTimeout(
          withRetry429(() =>
            callAiJsonShim<RawCargoItem>(
              'PARSE_CARGO',
              CARGO_INQUIRY_PARSER_PROMPT,
              prompts[i],
              {
                timeoutMs: LLM_TIMEOUT_MS,
                maxTokens: 16000,
                model: process.env.PARSE_CARGO_GEMINI_MODEL,
              },
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
