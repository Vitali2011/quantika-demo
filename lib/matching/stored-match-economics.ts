/**
 * Shared "stored match economics" helper — single source of truth for the
 * `tce_usd_per_day`, `freight_rate_usd_per_mt`, and `freight_rate_source`
 * columns written to the matches table.
 *
 * Previously the logic in pair-analyzer.ts:286-344 was the only correct path
 * (it included port-DA since #849); compute-matches.ts and
 * persist-session-matches.ts each had their own copy that called the simpler
 * `computeEstimatedTce` without DA. This module extracts the correct logic
 * once and all three write-paths route through it (Workstream A, plan 2026-06-08).
 *
 * Convention: `excludeWarRiskFromDailyTce: true` — matches the detail-page
 * convention in app/api/voyage/tce/route.ts:373 so list TCE == detail TCE.
 */

import type Database from 'better-sqlite3';
import type { ParsedCargo, ParsedVessel, EconomicsResult } from '@/lib/types';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';
import { cfValue } from '@/lib/types';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { sumMatchPortDaUsd } from '@/lib/port-da/match-da';
import { getLatestEuaPrice } from '@/lib/market/eua-repository';
import { resolveFreightRate } from '@/lib/matching/freight-resolver';
import { getBalticDayRate } from '@/lib/market/baltic-freight';
import {
  buildMatchEconomics,
  deriveEtsCoverage,
  parseLeadingNumber,
  parseConsumption,
} from '@/lib/matching/tce-calculator';
import { computeTce } from '@/lib/economics/compute-tce';
import { resolveConsMtPerDay } from '@/lib/economics/vessel-consumption';
import { DEFAULT_BUNKER_USD_PER_MT, FALLBACK_EUA_EUR_PER_TCO2 } from '@/lib/constants';
import { estimateVesselValueUsd } from '@/lib/economics/vessel-value';
import { now } from '@/lib/clock';

export interface StoredMatchEconomicsInput {
  cargo: ParsedCargo;
  vessel: ParsedVessel;
  db?: Database.Database;
  calculatedAt?: Date;
  bunkerPriceUsdPerMt?: number;
  /**
   * Sticky manual freight rate override ($/mt). When set, passed as tier-0
   * manualRateUsdPerMt to resolveFreightRate — wins over all other tiers.
   * Used by PATCH /api/matches/[id] so freight edits go through the canonical
   * economics path (not the stripped computeEstimatedTce). Closes I4.
   */
  freightOverrideUsdPerMt?: number | null;
}

export interface StoredMatchEconomicsResult {
  tce_usd_per_day: number | null;
  freight_rate_usd_per_mt: number | null;
  freight_rate_source: string | null;
  distance_nm: number | null;
  economics: EconomicsResult | null;
  /** Inner TCEBreakdown — exposes da_usd (port disbursements) and other line items. */
  tce_breakdown: TCEBreakdown | null;
  /** True when vessel consumption was absent and class-aware fallback fired. */
  consumption_estimated: boolean;
  /** Ballast reposition distance (open position → load port, nm). Persisted so detail reads stored value on session expiry. */
  ballast_distance_nm: number | null;
}

/**
 * Compute the economics fields that get stored in the matches table.
 *
 * Mirrors pair-analyzer.ts:286-344 exactly. Returns all-null when distance
 * cannot be resolved (null-safe for both write paths that call createMatch).
 */
export function computeStoredMatchEconomics(
  input: StoredMatchEconomicsInput,
): StoredMatchEconomicsResult {
  const { cargo, vessel, db } = input;
  const calcAt = (input.calculatedAt ?? now()).toISOString();
  const bunkerPriceUsdPerMt = input.bunkerPriceUsdPerMt;

  const nullResult: StoredMatchEconomicsResult = {
    tce_usd_per_day: null,
    freight_rate_usd_per_mt: null,
    freight_rate_source: null,
    distance_nm: null,
    economics: null,
    tce_breakdown: null,
    consumption_estimated: false,
    ballast_distance_nm: null,
  };

  const loadPort = cfValue(cargo.originPort);
  const dischargePort = cfValue(cargo.destinationPort);
  const distanceResult =
    loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;
  if (!distanceResult || !(distanceResult.nm > 0)) return nullResult;

  const cargoType =
    typeof cargo.cargoType === 'object' &&
    cargo.cargoType !== null &&
    'value' in cargo.cargoType
      ? (cargo.cargoType as unknown as { value: string }).value
      : (cargo.cargoType as string | null);

  const ecoDwt = cfValue(vessel.dwtSummer) ?? 0;
  const ecoQty = resolveCargoWeight(cargo) ?? 0;
  const ecoSpeed = parseLeadingNumber(vessel.speedLaden);

  // Ballast reposition distance: open position → load port.
  // Computed before resolveFreightRate so tier-2 Baltic conversion uses the same
  // single-voyage denominator as the TCE formula (I6 fix).
  const openPosition = cfValue(vessel.openPosition);
  const ballastResult =
    openPosition && loadPort ? getPortDistance(openPosition, loadPort) : null;
  const ballastDistanceNm = ballastResult?.nm ?? null;

  const resolvedFreight = resolveFreightRate({
    cargoType,
    parsedFreightRateUsdPerMt: cargo.freightRateUsd ?? null,
    vesselDwt: ecoDwt,
    quantityMt: ecoQty,
    distanceNm: distanceResult.nm,
    speedKts: ecoSpeed,
    // Unknown DWT → skip per-class Baltic tier; tier-3 estimate is class-neutral floor (#null-dwt-baltic).
    balticDayRate: db && ecoDwt > 0 ? getBalticDayRate(db, ecoDwt) : null,
    manualRateUsdPerMt: input.freightOverrideUsdPerMt ?? undefined,
    ballastDistanceNm,
  });

  // Port disbursement (DA): load + discharge fixed costs.
  const daResult = db
    ? sumMatchPortDaUsd([loadPort, dischargePort], ecoDwt, cargoType, db)
    : { totalUsd: 0, confidence: 'verified' as const };
  const daUsd = daResult.totalUsd;

  // Live EUA spot price — graceful fallback when table is absent.
  let liveEuaRow: ReturnType<typeof getLatestEuaPrice> = null;
  if (db) {
    try {
      liveEuaRow = getLatestEuaPrice(db, 'spot');
    } catch {
      liveEuaRow = null;
    }
  }

  // Use fallback=0 so that absent consumption triggers resolveConsMtPerDay class-aware
  // fallback (applied inside buildMatchEconomics and the breakdown re-derivation below).
  // The old flat-25 default was fabricated; passing 0 lets the vessel-class estimator run.
  const rawCons = parseConsumption(vessel.consumption, 0);
  const consumptionEstimated = rawCons <= 0;

  // excludeWarRiskFromDailyTce: true — matches detail-page convention so
  // stored list TCE == live detail TCE (war-risk is shown as a separate line).
  // vesselValueUsd: estimateVesselValueUsd(ecoDwt) — matches detail path (EconomicsTab)
  // so war-risk premium and totalUsd agree on HRA routes (H1 fix, Wave 2 stage 4).
  const econ = buildMatchEconomics({
    cargoType,
    distanceNm: distanceResult.nm,
    vesselDwt: ecoDwt,
    quantityMt: ecoQty,
    speedKts: ecoSpeed,
    consumptionMt: rawCons,
    loadPort,
    dischargePort,
    vesselOpenPosition: openPosition,
    calculatedAt: calcAt,
    resolvedFreight: {
      rate: resolvedFreight.value,
      source: resolvedFreight.source,
      confidence: resolvedFreight.confidence,
    },
    ballastDistanceNm,
    daUsd,
    bunkerPriceUsdPerMt,
    euaPriceEur: liveEuaRow?.price_eur_per_tco2 ?? undefined,
    vesselValueUsd: estimateVesselValueUsd(ecoDwt),
    excludeWarRiskFromDailyTce: true,
  });

  if (!econ) return nullResult;

  // Stage 8: re-derive TCEBreakdown via computeTce directly — same guards as
  // computeEstimatedTce internals; no originPort/destinationPort (war_risk_usd=$0
  // in breakdown, war-risk displayed from econ.breakdown). ECA-split not wired:
  // stored path did not compute it before Stage 8 (qa-937 MEDIUM-2, no new behaviour).
  //
  // NOTE: tce_usd_per_day is always taken from econ.tceUsdPerDay (the authoritative value).
  // This re-derivation is read-only so callers (tests, A5 parity) can inspect da_usd, etc.
  let tce_breakdown: TCEBreakdown | null = null;
  try {
    const { originEu, destEu, euLegPercent } = deriveEtsCoverage(loadPort, dischargePort);
    const euaForBreakdown = (liveEuaRow?.price_eur_per_tco2 != null && liveEuaRow.price_eur_per_tco2 > 0)
      ? liveEuaRow.price_eur_per_tco2
      : FALLBACK_EUA_EUR_PER_TCO2;
    // Canal detection is internal to buildMatchEconomics; reuse the value it computed.
    const canalUsdBk = econ.breakdown.canal_usd ?? 0;
    const resolvedBunkerBk = bunkerPriceUsdPerMt ?? DEFAULT_BUNKER_USD_PER_MT;
    const safeDwtBk = ecoDwt > 0 ? ecoDwt : 10_000;
    const safeSpeedBk = ecoSpeed > 0 ? ecoSpeed : 12;
    const safeQtyBk = ecoQty > 0 ? ecoQty : safeDwtBk * 0.65;
    const safeConsBk = resolveConsMtPerDay(rawCons, safeDwtBk);
    const bkResult = computeTce({
      dwt: safeDwtBk,
      valueUsd: estimateVesselValueUsd(ecoDwt),
      speedKts: safeSpeedBk,
      consumptionMtPerDay: safeConsBk,
      freightRateUsdPerMt: resolvedFreight.value,
      quantityMt: safeQtyBk,
      distanceNm: distanceResult.nm,
      ballastDistanceNm: ballastDistanceNm ?? undefined,
      bunkerPriceUsdPerMt: resolvedBunkerBk,
      euaPriceEur: euaForBreakdown,
      // NOTE: eurToUsdRate intentionally omitted here → EUR_USD_FALLBACK. The match
      // tce_usd_per_day parity chain (matching engine computeEstimatedTce ↔ this stored
      // recompute) must move to the sourced rate together; wiring only one side would
      // re-introduce list≠detail divergence (#1002/#1004 class). Follow-up.
      canalUsd: canalUsdBk,
      daUsd: daUsd > 0 ? daUsd : 0,
      euLegPercent,
      originEu,
      destEu,
      excludeWarRiskFromDailyTce: true,
    });
    tce_breakdown = bkResult.breakdown;
  } catch {
    tce_breakdown = null;
  }

  return {
    tce_usd_per_day: econ.tceUsdPerDay ?? null,
    freight_rate_usd_per_mt: econ.freightRateUsdPerMt ?? null,
    freight_rate_source: econ.freightRateSource ?? null,
    distance_nm: distanceResult.nm,
    economics: econ,
    tce_breakdown,
    consumption_estimated: consumptionEstimated,
    ballast_distance_nm: ballastDistanceNm,
  };
}
