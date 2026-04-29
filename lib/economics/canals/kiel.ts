/**
 * Kiel Canal fee calculator (flat fee by vessel type, no SCNT).
 *
 * Input Contract:
 *   vesselDwt, vesselNt must be finite > 0 → RangeError
 *   vesselType enforced by TypeScript union
 */

import type { CanalInput, CanalQuote } from './types';
import { queryTariff } from './db';

export function quoteKiel(input: CanalInput): CanalQuote {
  const { vesselDwt, vesselNt, vesselType } = input;

  if (!Number.isFinite(vesselNt) || vesselNt <= 0) {
    throw new RangeError(`vesselNt must be a finite positive number, got ${vesselNt}`);
  }
  if (!Number.isFinite(vesselDwt) || vesselDwt <= 0) {
    throw new RangeError(`vesselDwt must be a finite positive number, got ${vesselDwt}`);
  }

  const tariff = queryTariff('kiel', vesselType, 0);
  if (!tariff) {
    throw new Error(`No active Kiel tariff found for vessel_type=${vesselType}`);
  }

  const baseFeeUsd = tariff.base_fee_usd;
  const totalUsd = baseFeeUsd;

  return { baseFeeUsd, unitFeeUsd: 0, warRiskUsd: 0, totalUsd, source: tariff.source };
}
