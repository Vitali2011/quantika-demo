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
import { getLatestEuaPrice } from '@/lib/market/eua-repository';
import { optimizeSplitBunker } from '@/lib/economics/split-bunker';
import { computeBunkerComparison } from '@/lib/economics/bunker-comparison';
import { isCandidateInVoyageBasins } from '@/lib/sailing/voyage-basin';
import { estimateBunkerLift } from '@/lib/economics/bunker-lift';
import type { BunkerPrice } from '@/lib/economics/bunker';
import type { BunkerCandidateResult } from '@/lib/economics/bunker-comparison';

export const dynamic = 'force-dynamic';

/** 28 global bunker hubs — 23 deep-sea + 5 regional Med/Black Sea (Bug 4 coverage). */
const BUNKER_CANDIDATES = [
  // Asia/Pacific
  'SGSIN', 'CNZOS', 'HKHKG', 'KRPUS', 'CNSHA', 'TWKHH', 'LKCMB',
  // Middle East
  'AEFJR', 'SAJED',
  // Europe ARA + Med
  'NLRTM', 'BEANR', 'GIGIB', 'ESALG', 'ESLPA', 'GRPIR', 'TRIST', 'MTMLA',
  // Med + Black Sea regional hubs (Bug 4 — added 2026-06-02)
  'ROCND', // Constanta — main Black Sea hub
  'EGPSD', // Port Said — Suez gateway, Egypt
  'ITAUG', // Augusta — central Med
  'ESCEU', // Ceuta — alt Gibraltar Strait
  'CYLMS', // Limassol — Cyprus / East Med
  // Americas
  'USHOU', 'USNYC', 'PABLB', 'BRSSZ', 'USLAX',
  // Africa
  'ZADUR',
] as const;

/** Port is on-route if detour is within 15% of direct distance or under 200 NM. */
const DETOUR_RATIO = 0.15;
const DETOUR_ABS_CAP_NM = 200;

/** Vessel defaults for per-port effective $/MT math (Supramax representative). */
const DEFAULT_SPEED_KN = 12.5;
const DEFAULT_CONS_MT_PER_DAY = 28;
const DEFAULT_LIFT_TONNES = 500;
const DEFAULT_VESSEL_DAY_RATE_USD = 15000;

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

  const speedKn = speedParam && speedParam > 0 ? speedParam : DEFAULT_SPEED_KN;
  const consMtPerDay =
    consParam && consParam > 0 ? consParam : DEFAULT_CONS_MT_PER_DAY;

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

  const directResult = getPortDistance(from, to);
  const directNm = directResult?.nm ?? null;

  const db = getStore().getDb();

  const onRouteWithPrices: Array<{ port: string; price: BunkerPrice; deviationNm: number }> = [];

  for (const candidate of BUNKER_CANDIDATES) {
    // Bug 1 fix: basin filter — Pacific/EastAsia/SouthAtlantic hubs never on-route
    // for a Med/Black Sea/NW Europe voyage. Stops haversine-fallback false positives
    // at the root rather than tweaking detour thresholds.
    if (!isCandidateInVoyageBasins(candidate, from, to)) continue;

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
      liftTonnes,
      capacityMt: liftEstimate.capacityMt,
      liftCapped: liftEstimate.capped,
      candidates: [],
    });
  }

  const bunkerPrices = new Map<string, BunkerPrice>(
    onRouteWithPrices.map(({ port, price }) => [port, price]),
  );

  const result = optimizeSplitBunker({
    route: { fromPort: from, toPort: to, intermediatePorts: onRouteWithPrices.map(p => p.port) },
    bunkerPrices,
    consumptionMtPerDay: consMtPerDay,
  });

  const recommendedPort = result.bunkerPlan[0]?.port ?? onRouteWithPrices[0].port;
  const recommendedPrice = bunkerPrices.get(recommendedPort);

  let euaPriceEur: number | undefined;
  try {
    const euaRow = getLatestEuaPrice(db);
    euaPriceEur = euaRow?.price_eur_per_tco2 ?? undefined;
  } catch {
    // eua_prices table unavailable in this environment — carbon omitted from eff
  }

  const candidates = computeBunkerComparison({
    candidates: onRouteWithPrices.map(({ port, price, deviationNm }) => ({
      port,
      grade,
      priceUsdPerMt: price.vlsfo,
      deviationNm,
    })),
    vesselSpeedKn: speedKn,
    dailyConsMtPerDay: consMtPerDay,
    liftTonnes,
    vesselDayRateUsd: DEFAULT_VESSEL_DAY_RATE_USD,
    euaPriceEur,
  });

  return NextResponse.json({
    fallback: false,
    message: null,
    port: recommendedPort,
    priceUsdPerMt: recommendedPrice?.vlsfo ?? null,
    recommendation: result.recommendation,
    savingsUsd: result.savingsUsd,
    liftTonnes,
    capacityMt: liftEstimate.capacityMt,
    liftCapped: liftEstimate.capped,
    candidates,
  });
}
