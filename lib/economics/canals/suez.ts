/**
 * Suez Canal SCNT calculator (SCA tariff structure).
 *
 * SCNT (Suez Canal Net Tonnage) coefficients per vessel type:
 *   bulker    NT × 1.05
 *   tanker    NT × 1.10
 *   container NT × 1.08
 *   general   NT × 1.02
 *
 * Tier thresholds (SCNT):
 *   1: 0–5,000
 *   2: 5,001–10,000
 *   3: 10,001–20,000
 *   4: 20,001–70,000
 *   5: 70,001+
 *
 * Ballast discount: laden rate × 0.70
 *
 * War-risk: if the tariff row has war_risk_zone set and vesselValueUsd +
 * daysInHra are provided, calculateWarRiskPremium() is invoked and reported
 * as warRiskUsd (informational; excluded from totalUsd — the TCE chain
 * prices war-risk itself, audit C.8).
 *
 * Input Contract:
 *   vesselNt, vesselDwt  must be finite > 0     → RangeError
 *   daysInHra < 0        → clamped to 0 (no war risk)
 *   vesselType           → enforced by TypeScript union
 */

import type { SuezInput, SuezQuote, VesselType } from './types';
import { queryTariff } from './db';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';

const SCNT_COEFFICIENTS: Record<VesselType, number> = {
  bulker:    1.05,
  tanker:    1.10,
  container: 1.08,
  general:   1.02,
};

const BALLAST_FACTOR = 0.70;

/** Maps war_risk_zone identifiers to synthetic route params for calculateWarRiskPremium */
const WAR_RISK_ROUTES: Record<string, { fromPort: string; toPort: string; viaCanal?: string }> = {
  'red-sea-hra':     { fromPort: 'aden',     toPort: 'djibouti', viaCanal: 'suez' },
  'indian-ocean-hra':{ fromPort: 'mumbai',   toPort: 'salalah',  viaCanal: 'suez' },
  'black-sea-hra':   { fromPort: 'odessa',   toPort: 'istanbul' },
  'gulf-of-guinea':  { fromPort: 'lagos',    toPort: 'tema' },
};

function computeTier(scnt: number): 1 | 2 | 3 | 4 | 5 {
  if (scnt <= 5000)  return 1;
  if (scnt <= 10000) return 2;
  if (scnt <= 20000) return 3;
  if (scnt <= 70000) return 4;
  return 5;
}

export function quoteSuez(input: SuezInput): SuezQuote {
  const { vesselDwt, vesselNt, vesselType, laden, vesselValueUsd, daysInHra } = input;

  if (!Number.isFinite(vesselNt) || vesselNt <= 0) {
    throw new RangeError(`vesselNt must be a finite positive number, got ${vesselNt}`);
  }
  if (!Number.isFinite(vesselDwt) || vesselDwt <= 0) {
    throw new RangeError(`vesselDwt must be a finite positive number, got ${vesselDwt}`);
  }

  const coeff = SCNT_COEFFICIENTS[vesselType];
  const scnt = Math.round(vesselNt * coeff);
  const tier = computeTier(scnt);

  const tariff = queryTariff('suez', vesselType, scnt);
  if (!tariff) {
    throw new Error(`No active Suez tariff found for vessel_type=${vesselType}, SCNT=${scnt}`);
  }

  const ladenScntFee = tariff.base_fee_usd + scnt * tariff.per_scnt_fee_usd;
  const scntFeeUsd = laden ? ladenScntFee : ladenScntFee * BALLAST_FACTOR;
  const baseFeeUsd = tariff.base_fee_usd;

  let warRiskUsd = 0;
  if (tariff.war_risk_zone && vesselValueUsd != null && vesselValueUsd > 0) {
    const effectiveDays = Math.max(0, daysInHra ?? 0);
    if (effectiveDays > 0) {
      const route = WAR_RISK_ROUTES[tariff.war_risk_zone] ?? {
        fromPort: 'aden',
        toPort: 'djibouti',
        viaCanal: 'suez',
      };
      const warResult = calculateWarRiskPremium({ route, vesselValueUsd, daysInHra: effectiveDays });
      warRiskUsd = warResult.premiumUsd;
    }
  }

  // War-risk is quoted for visibility only — NOT folded into totalUsd. The TCE
  // chain (computeTce) prices war-risk itself; summing it here double-counted
  // for any caller passing vesselValueUsd (audit C.8, latent).
  const totalUsd = scntFeeUsd;

  return {
    scnt,
    tier,
    baseFeeUsd,
    scntFeeUsd,
    warRiskUsd,
    totalUsd,
    unitFeeUsd: scntFeeUsd,
    source: tariff.source,
  };
}
