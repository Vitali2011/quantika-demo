/**
 * Route-aware bunker port selection — single source of truth.
 *
 * `resolveOnRouteBunkerCandidates` is the exact algorithm previously inlined in
 * GET /api/voyage/bunker-recommendation (route.ts): basin filter → DB price
 * lookup → detour gate (15% / 200 NM) → effective-$/MT ranking. The HTTP route
 * and the match-creation write-paths BOTH call this so they return the IDENTICAL
 * recommended port for the same inputs — the list==detail invariant (#1002/#1009).
 *
 * `resolveRecommendedBunkerPort` is the thin wrapper the stored write-paths use:
 * it returns just the winning port + its live price, falling back to NLRTM when
 * no on-route candidate exists (preserves current behaviour for NW-Europe /
 * non-Med routes and unknown ports).
 *
 * Synchronous + DB-only (no network I/O) so it runs server-side at match creation.
 */

import type Database from 'better-sqlite3';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { getLatestEuaPrice } from '@/lib/market/eua-repository';
import { computeBunkerComparison } from '@/lib/economics/bunker-comparison';
import type { BunkerCandidateResult } from '@/lib/economics/bunker-comparison';
import { isCandidateInVoyageBasins } from '@/lib/sailing/voyage-basin';
import { estimateBunkerLift } from '@/lib/economics/bunker-lift';
import { resolveConsMtPerDay } from '@/lib/economics/vessel-consumption';
import { DEFAULT_BUNKER_USD_PER_MT } from '@/lib/constants';
import type { BunkerPrice } from '@/lib/economics/bunker';

export type BunkerGrade = 'VLSFO' | 'MGO';

/** 28 global bunker hubs — 23 deep-sea + 5 regional Med/Black Sea (Bug 4 coverage). */
export const BUNKER_CANDIDATES = [
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
export const DETOUR_RATIO = 0.15;
export const DETOUR_ABS_CAP_NM = 200;

/** Log a warning if any on-route candidate's price is older than this many days. */
export const BUNKER_STALE_DAYS = 7;

/** Vessel defaults for per-port effective $/MT math (Supramax representative). */
export const DEFAULT_SPEED_KN = 12.5;
export const DEFAULT_LIFT_TONNES = 500;
export const DEFAULT_VESSEL_DAY_RATE_USD = 15000;

/** Optional vessel inputs that sharpen the effective-$/MT ranking. */
export interface BunkerVesselOpts {
  /** Vessel DWT — drives consumption fallback + bunker-lift capacity cap. */
  dwt?: number | null;
  /** Vessel speed (kn). <=0 / absent → DEFAULT_SPEED_KN. */
  speedKn?: number | null;
  /** Raw stored consumption (t/day). resolveConsMtPerDay applied internally. */
  consMtPerDay?: number | null;
  /** Estimated voyage days for the bunker-lift estimate. */
  voyageDays?: number | null;
}

export interface OnRouteBunkerResult {
  /** True when no on-route candidate had a price → caller should use NLRTM. */
  fallback: boolean;
  /** On-route candidates sorted by effectiveUsdPerMt ASC. Empty on fallback. */
  candidates: BunkerCandidateResult[];
  /** Required bunker lift (mt) used for the ranking. */
  liftTonnes: number;
  /** Vessel bunker tank capacity (mt); 0 if DWT unknown. */
  capacityMt: number;
  /** True if lift was clamped to tank capacity. */
  liftCapped: boolean;
}

export interface RecommendedBunkerPort {
  /** Winning port LOCODE (e.g. 'ESCEU') or 'NLRTM' on fallback. */
  port: string;
  /** Live raw price ($/MT) at the winning port. */
  priceUsdPerMt: number;
  /** True when no on-route candidate existed and NLRTM was used. */
  fallback: boolean;
}

/**
 * Compute the on-route bunker candidates for a voyage, sorted cheapest-effective
 * first. Mirrors the GET /api/voyage/bunker-recommendation algorithm exactly so
 * the route handler and the stored write-paths agree on the winner.
 */
export function resolveOnRouteBunkerCandidates(
  db: Database.Database,
  from: string,
  to: string,
  grade: BunkerGrade,
  vessel?: BunkerVesselOpts,
): OnRouteBunkerResult {
  const dwt = vessel?.dwt ?? 0;
  const speedParam = vessel?.speedKn ?? null;
  const speedKn = speedParam && speedParam > 0 ? speedParam : DEFAULT_SPEED_KN;
  const rawCons = vessel?.consMtPerDay ?? 0;
  const consMtPerDay = resolveConsMtPerDay(rawCons, dwt);

  const liftEstimate = estimateBunkerLift({
    dwt,
    dailyConsMtPerDay: consMtPerDay,
    voyageDays: vessel?.voyageDays ?? 0,
  });
  const liftTonnes = liftEstimate.liftTonnes > 0 ? liftEstimate.liftTonnes : DEFAULT_LIFT_TONNES;

  const directResult = getPortDistance(from, to);
  const directNm = directResult?.nm ?? null;

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - BUNKER_STALE_DAYS);
  const staleThresholdStr = staleThreshold.toISOString().slice(0, 10);

  const onRouteWithPrices: Array<{ port: string; price: BunkerPrice; deviationNm: number }> = [];

  for (const candidate of BUNKER_CANDIDATES) {
    // Basin filter — Pacific/EastAsia/SouthAtlantic hubs never on-route for a
    // Med/Black Sea/NW Europe voyage. Stops haversine-fallback false positives.
    if (!isCandidateInVoyageBasins(candidate, from, to)) continue;

    const priceRow = getLatestBunkerPrice(db, candidate, grade);
    if (!priceRow) continue;

    // Freshness watchdog — log stale price, no DB write, no exclusion.
    if (priceRow.price_date < staleThresholdStr) {
      console.warn(`[bunker-rec] bunker_price_stale: ${candidate} last=${priceRow.price_date}`);
    }

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
      // If either leg distance is unknown, include the candidate (fail-open), deviationNm stays 0.
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
    return {
      fallback: true,
      candidates: [],
      liftTonnes,
      capacityMt: liftEstimate.capacityMt,
      liftCapped: liftEstimate.capped,
    };
  }

  let euaPriceEur: number | undefined;
  try {
    const euaRow = getLatestEuaPrice(db);
    euaPriceEur = euaRow?.price_eur_per_tco2 ?? undefined;
  } catch {
    // eua_prices table unavailable — carbon omitted from effective $/MT.
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

  return {
    fallback: false,
    candidates,
    liftTonnes,
    capacityMt: liftEstimate.capacityMt,
    liftCapped: liftEstimate.capped,
  };
}

/** NLRTM fallback — live price if present, else the empty-table default. */
function nlrtmFallback(db: Database.Database, grade: BunkerGrade): RecommendedBunkerPort {
  let price = DEFAULT_BUNKER_USD_PER_MT;
  try {
    const row = getLatestBunkerPrice(db, 'NLRTM', grade);
    if (row) price = row.price_usd_per_mt;
  } catch {
    // bunker_prices table unavailable — keep the constant default.
  }
  return { port: 'NLRTM', priceUsdPerMt: price, fallback: true };
}

/**
 * Resolve the cheapest on-route bunker port for a voyage.
 *
 * Returns the winning port LOCODE + its live raw price. Falls back to NLRTM when
 * either endpoint is unknown or no on-route candidate has a price — preserving
 * the current behaviour for non-Med routes. The returned `port` is what gets
 * persisted in matches.bunker_port; the returned `priceUsdPerMt` is what feeds
 * computeStoredMatchEconomics so the stored TCE uses the same port as the detail
 * page (which seeds its bunker selector from the stored port).
 */
export function resolveRecommendedBunkerPort(
  db: Database.Database,
  loadPort: string | null | undefined,
  dischargePort: string | null | undefined,
  grade: BunkerGrade,
  vessel?: BunkerVesselOpts,
): RecommendedBunkerPort {
  if (!loadPort || !dischargePort) return nlrtmFallback(db, grade);

  let result: OnRouteBunkerResult;
  try {
    result = resolveOnRouteBunkerCandidates(db, loadPort, dischargePort, grade, vessel);
  } catch {
    return nlrtmFallback(db, grade);
  }

  const winner = result.candidates[0];
  if (!winner) return nlrtmFallback(db, grade);

  return { port: winner.port, priceUsdPerMt: winner.priceUsdPerMt, fallback: false };
}
