/**
 * GET /api/voyage/bunker-recommendation
 *
 * Returns on-route bunker port candidates with per-port effective $/MT math,
 * sorted cheapest-effective first. Backward-compat fields (port, priceUsdPerMt,
 * recommendation, savingsUsd) are preserved for existing consumers.
 *
 * Query params:
 *   from   – origin port (LOCODE or canonical name)
 *   to     – destination port (LOCODE or canonical name)
 *   grade  – VLSFO | MGO (default VLSFO)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { formatNumber } from '@/lib/utils';
import { consFromDwt, resolveConsMtPerDay } from '@/lib/economics/vessel-consumption';
import { estimateBunkerLift } from '@/lib/economics/bunker-lift';
import {
  resolveOnRouteBunkerCandidates,
  BUNKER_CANDIDATES,
  DEFAULT_LIFT_TONNES,
} from '@/lib/economics/bunker-routing';
import type { BunkerCandidateResult } from '@/lib/economics/bunker-comparison';

export { consFromDwt } from '@/lib/economics/vessel-consumption';
/** Re-exported for backward-compat — canonical definition lives in bunker-routing.ts. */
export { BUNKER_CANDIDATES } from '@/lib/economics/bunker-routing';

export const dynamic = 'force-dynamic';

/** Stored cons >1.8× the DWT-class midpoint is implausible (e.g. Supramax figure on a coaster). */
const IMPLAUSIBLE_CONS_FACTOR = 1.8;

/**
 * Clamp a stored vessel consumption to the DWT-class midpoint when it is implausibly high.
 * "Present-but-wrong" Q88 values (e.g. 22 t/day on a 3 200 DWT coaster) would otherwise
 * bypass consFromDwt and produce a wildly over-sized bunker lift.
 */
export function clampConsForVesselClass(
  rawCons: number,
  dwt: number,
): { cons: number; clamped: boolean } {
  if (dwt <= 0) return { cons: rawCons, clamped: false };
  const classEst = consFromDwt(dwt);
  if (rawCons > classEst * IMPLAUSIBLE_CONS_FACTOR) {
    return { cons: classEst, clamped: true };
  }
  return { cons: rawCons, clamped: false };
}

function parseFiniteNumber(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface BunkerCandidateRow extends BunkerCandidateResult {}

export interface BunkerRecommendationResponse {
  fallback: boolean;
  message: string | null;
  /** Best candidate port (backward-compat). */
  port: string | null;
  /** Best candidate price (backward-compat). */
  priceUsdPerMt: number | null;
  recommendation: string | null;
  savingsUsd: number;
  /** Required bunker lift in mt for this voyage (computed from vessel + route inputs). */
  liftTonnes: number;
  /** Vessel bunker tank capacity in mt; 0 if DWT not provided. */
  capacityMt: number;
  /** True if lift was clamped to tank capacity (voyage exceeds vessel range). */
  liftCapped: boolean;
  /** On-route candidates sorted by effectiveUsdPerMt ASC. Empty on fallback. */
  candidates: BunkerCandidateRow[];
}

export async function GET(req: NextRequest): Promise<NextResponse<BunkerRecommendationResponse>> {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const gradeRaw = (url.searchParams.get('grade') ?? 'VLSFO').toUpperCase();
  const grade = gradeRaw === 'MGO' ? 'MGO' : 'VLSFO';

  const dwtParam = parseFiniteNumber(url.searchParams.get('dwt'));
  const speedParam = parseFiniteNumber(url.searchParams.get('speedKn'));
  const consParam = parseFiniteNumber(url.searchParams.get('consMtPerDay'));
  const voyageDaysParam = parseFiniteNumber(url.searchParams.get('voyageDays'));

  const rawCons = consParam ?? 0;
  const consMtPerDay = resolveConsMtPerDay(rawCons, dwtParam ?? 0);
  if (rawCons > 0 && consMtPerDay !== rawCons) {
    console.warn(
      `[bunker-rec] cons clamped: ${rawCons}→${consMtPerDay} t/day (DWT ${dwtParam ?? 0})`,
    );
  }

  const liftEstimate = estimateBunkerLift({
    dwt: dwtParam ?? 0,
    dailyConsMtPerDay: consMtPerDay,
    voyageDays: voyageDaysParam ?? 0,
  });
  const liftTonnes = liftEstimate.liftTonnes > 0 ? liftEstimate.liftTonnes : DEFAULT_LIFT_TONNES;

  if (!from || !to) {
    return NextResponse.json(
      {
        fallback: true,
        message: 'from and to required',
        port: null,
        priceUsdPerMt: null,
        recommendation: null,
        savingsUsd: 0,
        liftTonnes,
        capacityMt: liftEstimate.capacityMt,
        liftCapped: liftEstimate.capped,
        candidates: [],
      },
      { status: 400 },
    );
  }

  const db = getStore().getDb();

  // Single source of truth — the same selection algorithm the stored write-paths
  // call via resolveRecommendedBunkerPort, so route winner == stored bunker_port.
  const result = resolveOnRouteBunkerCandidates(db, from, to, grade, {
    dwt: dwtParam ?? 0,
    speedKn: speedParam,
    consMtPerDay: rawCons,
    voyageDays: voyageDaysParam ?? 0,
  });

  if (result.fallback || result.candidates.length === 0) {
    return NextResponse.json({
      fallback: true,
      message: 'No bunker port on this route — enter price manually or select nearest port',
      port: null,
      priceUsdPerMt: null,
      recommendation: null,
      savingsUsd: 0,
      liftTonnes: result.liftTonnes,
      capacityMt: result.capacityMt,
      liftCapped: result.liftCapped,
      candidates: [],
    });
  }

  const candidates = result.candidates;
  // Winner = min effective $/MT — candidates[0] (sorted ASC). priceUsdPerMt on the
  // result IS the raw price (== the old bunkerPrices.get(port).vlsfo).
  const effWinner = candidates[0];
  const effLoser = candidates[candidates.length - 1];

  const savingsUsd =
    effWinner !== effLoser
      ? Math.max(0, Math.round((effLoser.effectiveUsdPerMt - effWinner.effectiveUsdPerMt) * result.liftTonnes))
      : 0;

  const recommendation =
    savingsUsd > 0
      ? `Bunker at ${effWinner.port} (${effWinner.effectiveUsdPerMt} USD/MT eff.) — saves ~$${formatNumber(savingsUsd)} vs ${effLoser.port}`
      : `Bunker at ${effWinner.port} (${effWinner.effectiveUsdPerMt} USD/MT eff.)`;

  return NextResponse.json({
    fallback: false,
    message: null,
    port: effWinner.port,
    priceUsdPerMt: effWinner.priceUsdPerMt,
    recommendation,
    savingsUsd,
    liftTonnes: result.liftTonnes,
    capacityMt: result.capacityMt,
    liftCapped: result.liftCapped,
    candidates,
  });
}
