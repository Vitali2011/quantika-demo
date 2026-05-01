/**
 * β-06 Route Decision — Suez vs Cape A/B comparison.
 *
 * Computes daily TCE for both routings (via Suez Canal vs around
 * Cape of Good Hope) and produces an LLM-explained recommendation.
 *
 * Falls back to a deterministic template when the LLM is unavailable.
 */

import { calculateTCE, type VoyageInput, type TCEBreakdown } from './voyage-calculator';
import { callAiText } from '@/lib/openai';

export interface RouteCompareLeg {
  breakdown: TCEBreakdown;
  total_usd: number;
  daily_tce_usd: number;
  durationDays: number;
}

export interface RouteRecommendation {
  route: 'suez' | 'cape';
  reason: string;
  savings_usd: number;
  savings_days: number;
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
  const verb = savingsDays >= 0 ? 'saves' : 'costs';
  const days = Math.abs(savingsDays);
  return `${winner === 'suez' ? 'Suez' : 'Cape'} ${verb} $${Math.round(
    savingsUsd,
  ).toLocaleString('en-US')} and ${days} days vs alternative.`;
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
  try {
    const text = await callAiText(
      prompt,
      'You are a chartering analyst. Be concise (1-2 sentences). No markdown.',
    );
    const trimmed = (text ?? '').trim();
    if (!trimmed) return templateReason(winner, savingsUsd, savingsDays);
    return trimmed;
  } catch {
    return templateReason(winner, savingsUsd, savingsDays);
  }
}

export async function compareRoutes(
  origin: string,
  destination: string,
  vessel: VoyageInput['vessel'],
  cargo: VoyageInput['cargo'],
  marketRates: { bunkerPriceUsdPerMt: number; euaPriceEur: number },
): Promise<RouteCompareResult> {
  const dist = lookupDistances(origin, destination);
  const ctx: CompareInput = { vessel, cargo, marketRates };

  const suez = buildLeg(origin, destination, dist.suezNm, true, ctx);
  const cape = buildLeg(origin, destination, dist.capeNm, false, ctx);

  const winner: 'suez' | 'cape' = suez.daily_tce_usd >= cape.daily_tce_usd ? 'suez' : 'cape';
  const winLeg = winner === 'suez' ? suez : cape;
  const loseLeg = winner === 'suez' ? cape : suez;

  const savingsUsd = Math.max(0, Math.round(loseLeg.total_usd - winLeg.total_usd));
  const savingsDays = Math.max(0, Math.round((loseLeg.durationDays - winLeg.durationDays) * 10) / 10);

  const reason = await llmReason(
    suez.daily_tce_usd,
    cape.daily_tce_usd,
    winner,
    savingsUsd,
    savingsDays,
  );

  return {
    suez,
    cape,
    recommendation: {
      route: winner,
      reason,
      savings_usd: savingsUsd,
      savings_days: savingsDays,
    },
  };
}
