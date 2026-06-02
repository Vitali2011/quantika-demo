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
import { getPortDistance } from '@/lib/sailing/port-distances';
import { getStore } from '@/lib/session-store';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { optimizeSplitBunker } from '@/lib/economics/split-bunker';
import { computeBunkerComparison } from '@/lib/economics/bunker-comparison';
import type { BunkerPrice } from '@/lib/economics/bunker';
import type { BunkerCandidateResult } from '@/lib/economics/bunker-comparison';

export const dynamic = 'force-dynamic';

/** 23 global bunker hubs (expanded from 5 in Delta-Step 2). */
const BUNKER_CANDIDATES = [
  'SGSIN', // Singapore
  'CNZOS', // Zhoushan
  'HKHKG', // Hong Kong
  'KRPUS', // Busan
  'CNSHA', // Shanghai
  'TWKHH', // Kaohsiung
  'LKCMB', // Colombo
  'AEFJR', // Fujairah
  'SAJED', // Jeddah
  'NLRTM', // Rotterdam
  'BEANR', // Antwerp
  'GIGIB', // Gibraltar
  'ESALG', // Algeciras
  'ESLPA', // Las Palmas
  'GRPIR', // Piraeus
  'TRIST', // Istanbul
  'USHOU', // Houston
  'USNYC', // New York
  'PABLB', // Balboa (Panama)
  'BRSSZ', // Santos
  'USLAX', // Los Angeles
  'ZADUR', // Durban
  'MTMLA', // Malta (Valletta)
] as const;

/** Port is on-route if detour is within 15% of direct distance or under 200 NM. */
const DETOUR_RATIO = 0.15;
const DETOUR_ABS_CAP_NM = 200;

/** Vessel defaults for per-port effective $/MT math (Supramax representative). */
const DEFAULT_SPEED_KN = 12.5;
const DEFAULT_CONS_MT_PER_DAY = 28;
const DEFAULT_LIFT_TONNES = 500;
const DEFAULT_VESSEL_DAY_RATE_USD = 15000;

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
  /** On-route candidates sorted by effectiveUsdPerMt ASC. Empty on fallback. */
  candidates: BunkerCandidateRow[];
}

export async function GET(req: NextRequest): Promise<NextResponse<BunkerRecommendationResponse>> {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const gradeRaw = (url.searchParams.get('grade') ?? 'VLSFO').toUpperCase();
  const grade = gradeRaw === 'MGO' ? 'MGO' : 'VLSFO';

  if (!from || !to) {
    return NextResponse.json(
      {
        fallback: true,
        message: 'from and to required',
        port: null,
        priceUsdPerMt: null,
        recommendation: null,
        savingsUsd: 0,
        candidates: [],
      },
      { status: 400 },
    );
  }

  const directResult = getPortDistance(from, to);
  const directNm = directResult?.nm ?? null;

  const db = getStore().getDb();

  const onRouteWithPrices: Array<{ port: string; price: BunkerPrice; deviationNm: number }> = [];

  for (const candidate of BUNKER_CANDIDATES) {
    const priceRow = getLatestBunkerPrice(db, candidate, grade);
    if (!priceRow) continue;

    let deviationNm = 0;
    if (directNm != null) {
      const leg1 = getPortDistance(from, candidate);
      const leg2 = getPortDistance(candidate, to);
      if (leg1 && leg2) {
        const rawDetour = leg1.nm + leg2.nm - directNm;
        const threshold = Math.max(DETOUR_RATIO * directNm, DETOUR_ABS_CAP_NM);
        if (rawDetour > threshold) continue;
        deviationNm = rawDetour;
      }
      // If either leg distance is unknown, include the candidate (fail-open), deviationNm stays 0
    }

    onRouteWithPrices.push({
      port: candidate,
      deviationNm,
      price: {
        port: candidate,
        vlsfo: priceRow.price_usd_per_mt,
        fetched_at: priceRow.fetched_at,
      },
    });
  }

  if (onRouteWithPrices.length === 0) {
    return NextResponse.json({
      fallback: true,
      message: 'No bunker port on this route — enter price manually or select nearest port',
      port: null,
      priceUsdPerMt: null,
      recommendation: null,
      savingsUsd: 0,
      candidates: [],
    });
  }

  const bunkerPrices = new Map<string, BunkerPrice>(
    onRouteWithPrices.map(({ port, price }) => [port, price]),
  );

  const result = optimizeSplitBunker({
    route: { fromPort: from, toPort: to, intermediatePorts: onRouteWithPrices.map(p => p.port) },
    bunkerPrices,
    consumptionMtPerDay: DEFAULT_CONS_MT_PER_DAY,
  });

  const recommendedPort = result.bunkerPlan[0]?.port ?? onRouteWithPrices[0].port;
  const recommendedPrice = bunkerPrices.get(recommendedPort);

  const candidates = computeBunkerComparison({
    candidates: onRouteWithPrices.map(({ port, price, deviationNm }) => ({
      port,
      grade,
      priceUsdPerMt: price.vlsfo,
      deviationNm,
    })),
    vesselSpeedKn: DEFAULT_SPEED_KN,
    dailyConsMtPerDay: DEFAULT_CONS_MT_PER_DAY,
    liftTonnes: DEFAULT_LIFT_TONNES,
    vesselDayRateUsd: DEFAULT_VESSEL_DAY_RATE_USD,
  });

  return NextResponse.json({
    fallback: false,
    message: null,
    port: recommendedPort,
    priceUsdPerMt: recommendedPrice?.vlsfo ?? null,
    recommendation: result.recommendation,
    savingsUsd: result.savingsUsd,
    candidates,
  });
}
