/**
 * β-06 Route Decision — Suez vs Cape A/B comparison.
 *
 * Computes daily TCE for both routings (via Suez Canal vs around
 * Cape of Good Hope) and produces an LLM-explained recommendation.
 *
 * Falls back to a deterministic template when the LLM is unavailable.
 *
 * Performance (βf3-06):
 * - Module-scope import of voyage-calculator + openai ensures Node.js caches
 *   the modules on the first request — no repeated resolution on warm hits.
 * - LLM_REASON_TIMEOUT_MS caps the llmReason() await so cold-start
 *   is bounded even when ClipProxy/OpenAI has high latency.
 */

import { calculateTCE, type VoyageInput, type TCEBreakdown } from './voyage-calculator';
import { callAiText } from '@/lib/openai';

// βf3-06: LLM reason timeout — cap the AI explain call so cold-start ≤5s.
// The LLM path is non-critical (fallback template is always available).
const LLM_REASON_TIMEOUT_MS = 4_000;

export interface RouteCompareLeg {
  breakdown: TCEBreakdown;
  total_usd: number;
  daily_tce_usd: number;
  durationDays: number;
}

export interface RouteRecommendation {
  route: 'suez' | 'cape';
  reason: string;
  /**
   * Signed: positive когда winner cheaper by total_usd, negative если winner more expensive
   * (winner может быть дороже total-wise но выигрывать по daily_tce).
   */
  savings_usd: number;
  /**
   * Signed: positive если winner faster than alternative, negative если winner slower.
   * Replaces previous Math.max(0, ...) clamp which hid time penalty for broker.
   */
  savings_days: number;
  /**
   * Convenience: max(0, -savings_days). >0 когда winner slower (broker time penalty).
   */
  extra_days_winner: number;
  /**
   * Daily TCE delta on the same axis as winner decision (winner picked by daily_tce).
   */
  savings_usd_per_day: number;
}

/**
 * Pure inputs for {@link decideRoute} — no dependence on TCE breakdown internals.
 */
export interface DecideRouteLeg {
  durationDays: number;
  dailyTceUsd: number;
  totalUsd: number;
}

export interface DecideRouteInput {
  suez: DecideRouteLeg;
  cape: DecideRouteLeg;
}

export interface DecideRouteOutput {
  route: 'suez' | 'cape';
  savings_usd: number;
  savings_days: number;
  extra_days_winner: number;
  savings_usd_per_day: number;
}

/**
 * Pure recommendation logic — picks winner by daily TCE and exposes signed deltas.
 *
 * Contract:
 * - Winner is picked by `dailyTceUsd` (suez wins ties).
 * - `savings_days = loser.duration - winner.duration` — SIGNED. Positive если winner faster.
 * - `extra_days_winner = max(0, -savings_days)` — broker-facing time penalty.
 * - `savings_usd = loser.totalUsd - winner.totalUsd` — SIGNED (positive если winner cheaper total).
 * - `savings_usd_per_day = (winner.dailyTceUsd - loser.dailyTceUsd) * winner.durationDays`.
 */
export function decideRoute(input: DecideRouteInput): DecideRouteOutput {
  const { suez, cape } = input;
  const route: 'suez' | 'cape' = suez.dailyTceUsd >= cape.dailyTceUsd ? 'suez' : 'cape';
  const winner = route === 'suez' ? suez : cape;
  const loser = route === 'suez' ? cape : suez;

  const savings_days = Math.round((loser.durationDays - winner.durationDays) * 10) / 10;
  const extra_days_winner = savings_days < 0 ? Math.round(-savings_days * 10) / 10 : 0;
  const savings_usd = Math.round(loser.totalUsd - winner.totalUsd);
  const savings_usd_per_day = Math.round(
    (winner.dailyTceUsd - loser.dailyTceUsd) * winner.durationDays,
  );

  return { route, savings_usd, savings_days, extra_days_winner, savings_usd_per_day };
}

export interface RouteCompareResult {
  suez: RouteCompareLeg;
  cape: RouteCompareLeg;
  recommendation: RouteRecommendation;
}

interface DistancePair {
  suezNm: number;
  capeNm: number;
}

/**
 * Hardcoded distance table (nautical miles).
 * Pairs are normalised by sorted port names so order-independent.
 */
const DISTANCE_TABLE: Record<string, DistancePair> = {
  'antwerp|singapore': { suezNm: 8_300, capeNm: 11_800 },
  'rotterdam|singapore': { suezNm: 8_300, capeNm: 11_800 },
  'mumbai|rotterdam': { suezNm: 6_400, capeNm: 10_400 },
  'hamburg|shanghai': { suezNm: 10_500, capeNm: 13_500 },
  'rotterdam|shanghai': { suezNm: 10_500, capeNm: 13_500 },
};

const DEFAULT_DISTANCE: DistancePair = { suezNm: 9_000, capeNm: 12_500 };

function normalisePort(name: string): string {
  return (name || '').trim().toLowerCase();
}

function lookupDistances(origin: string, destination: string): DistancePair {
  const a = normalisePort(origin);
  const b = normalisePort(destination);
  const key = [a, b].sort().join('|');
  return DISTANCE_TABLE[key] ?? DEFAULT_DISTANCE;
}

function durationDays(distanceNm: number, speedKts: number): number {
  if (!Number.isFinite(distanceNm) || !Number.isFinite(speedKts) || speedKts <= 0) {
    return 0;
  }
  return Math.round((distanceNm / (speedKts * 24)) * 10) / 10;
}

const SUEZ_CANAL_DUES_USD = 480_000; // matches scenario narrative
const HRA_DAYS_FOR_SUEZ = 4; // approx Bab-el-Mandeb + Red Sea exposure

interface CompareInput {
  vessel: VoyageInput['vessel'];
  cargo: VoyageInput['cargo'];
  marketRates: { bunkerPriceUsdPerMt: number; euaPriceEur: number };
}

function buildLeg(
  origin: string,
  destination: string,
  distanceNm: number,
  viaSuez: boolean,
  { vessel, cargo, marketRates }: CompareInput,
): RouteCompareLeg {
  const speed = vessel.speedKts > 0 ? vessel.speedKts : 13;
  const dur = durationDays(distanceNm, speed);

  const input: VoyageInput = {
    vessel,
    route: {
      originPort: origin,
      destinationPort: destination,
      distanceNm,
      viaSuez,
    },
    cargo,
    bunkerPriceUsdPerMt: marketRates.bunkerPriceUsdPerMt,
    euaPriceEur: marketRates.euaPriceEur,
    durationDays: dur,
    canalUsd: viaSuez ? SUEZ_CANAL_DUES_USD : 0,
    daUsd: 0,
    daysInHra: viaSuez ? HRA_DAYS_FOR_SUEZ : 0,
  };

  const tce = calculateTCE(input);
  return {
    breakdown: tce.breakdown,
    total_usd: tce.total_usd,
    daily_tce_usd: tce.daily_tce_usd,
    durationDays: dur,
  };
}

function templateReason(
  winner: 'suez' | 'cape',
  savingsUsd: number,
  savingsDays: number,
): string {
  const winnerName = winner === 'suez' ? 'Suez' : 'Cape';
  const usdAbs = Math.abs(Math.round(savingsUsd)).toLocaleString('en-US');
  const usdVerb = savingsUsd >= 0 ? 'saves' : 'costs';
  const daysAbs = Math.abs(savingsDays);
  // Broker MUST see direction of time delta — not clamped to "saves N days".
  const daysClause =
    savingsDays >= 0
      ? `${daysAbs} days faster`
      : `${daysAbs} days longer`;
  return `${winnerName} ${usdVerb} $${usdAbs} and is ${daysClause} vs alternative.`;
}

async function llmReason(
  suezDaily: number,
  capeDaily: number,
  winner: 'suez' | 'cape',
  savingsUsd: number,
  savingsDays: number,
): Promise<string> {
  const prompt = [
    `Suez TCE: $${suezDaily}/day`,
    `Cape TCE: $${capeDaily}/day`,
    `Winner: ${winner}`,
    `Savings: $${savingsUsd} and ${savingsDays} days vs alternative.`,
    '',
    'In 1-2 short sentences, explain which routing is better and why.',
  ].join('\n');

  // βf3-06: race LLM call against a hard timeout so cold-start is bounded.
  const fallback = templateReason(winner, savingsUsd, savingsDays);
  const timeoutPromise = new Promise<string>(resolve =>
    setTimeout(() => resolve(fallback), LLM_REASON_TIMEOUT_MS)
  );

  console.time('cold:llm-reason');
  try {
    // wave-γ-1 hardening: bound the internal LLM timeout to LLM_REASON_TIMEOUT_MS.
    // Without this option, callAiText falls back to the 85s default, so the
    // outer Promise.race resolves with `fallback` while the LLM keeps streaming
    // for ~80s, consuming CLI proxy quota and a connection slot. Defense-in-depth:
    // we still keep the outer race in case callAiText hangs in some other way.
    const aiPromise = callAiText(
      prompt,
      'You are a chartering analyst. Be concise (1-2 sentences). No markdown.',
      undefined,
      { timeoutMs: LLM_REASON_TIMEOUT_MS },
    ).then(text => {
      const trimmed = (text ?? '').trim();
      return trimmed || fallback;
    }).catch(() => fallback);

    const result = await Promise.race([aiPromise, timeoutPromise]);
    return result;
  } finally {
    console.timeEnd('cold:llm-reason');
  }
}

export async function compareRoutes(
  origin: string,
  destination: string,
  vessel: VoyageInput['vessel'],
  cargo: VoyageInput['cargo'],
  marketRates: { bunkerPriceUsdPerMt: number; euaPriceEur: number },
): Promise<RouteCompareResult> {
  // βf3-06: timing markers for cold-start profiling
  console.time('cold:distances');
  const dist = lookupDistances(origin, destination);
  console.timeEnd('cold:distances');

  const ctx: CompareInput = { vessel, cargo, marketRates };

  console.time('cold:scoring');
  const suez = buildLeg(origin, destination, dist.suezNm, true, ctx);
  const cape = buildLeg(origin, destination, dist.capeNm, false, ctx);
  console.timeEnd('cold:scoring');

  const decision = decideRoute({
    suez: {
      durationDays: suez.durationDays,
      dailyTceUsd: suez.daily_tce_usd,
      totalUsd: suez.total_usd,
    },
    cape: {
      durationDays: cape.durationDays,
      dailyTceUsd: cape.daily_tce_usd,
      totalUsd: cape.total_usd,
    },
  });

  const reason = await llmReason(
    suez.daily_tce_usd,
    cape.daily_tce_usd,
    decision.route,
    decision.savings_usd,
    decision.savings_days,
  );

  return {
    suez,
    cape,
    recommendation: {
      route: decision.route,
      reason,
      savings_usd: decision.savings_usd,
      savings_days: decision.savings_days,
      extra_days_winner: decision.extra_days_winner,
      savings_usd_per_day: decision.savings_usd_per_day,
    },
  };
}
