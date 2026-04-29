/**
 * Panama Canal fee calculator (ACP simplified model).
 * Fee = base_fee_usd + vesselNt × per_scnt_fee_usd (repurposed as per-NT rate).
 *
 * Input Contract:
 *   vesselDwt, vesselNt must be finite > 0 → RangeError
 *   vesselType enforced by TypeScript union
 */

import type { CanalInput, CanalQuote } from './types';
import { queryTariff } from './db';

export function quotePanama(input: CanalInput): CanalQuote {
  const { vesselDwt, vesselNt, vesselType } = input;

  if (!Number.isFinite(vesselNt) || vesselNt <= 0) {
    throw new RangeError(`vesselNt must be a finite positive number, got ${vesselNt}`);
  }
  if (!Number.isFinite(vesselDwt) || vesselDwt <= 0) {
    throw new RangeError(`vesselDwt must be a finite positive number, got ${vesselDwt}`);
  }

  const tariff = queryTariff('panama', vesselType, vesselNt);
  if (!tariff) {
    throw new Error(`No active Panama tariff found for vessel_type=${vesselType}`);
  }

  const baseFeeUsd = tariff.base_fee_usd;
  const unitFeeUsd = vesselNt * tariff.per_scnt_fee_usd;
  const totalUsd = baseFeeUsd + unitFeeUsd;

  return { baseFeeUsd, unitFeeUsd, warRiskUsd: 0, totalUsd, source: tariff.source };
}
