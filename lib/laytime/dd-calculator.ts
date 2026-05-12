import type { DemurrageDespatchInput, DemurrageDespatchResult } from '../types';

/**
 * Calculate demurrage payable or despatch earned based on LaytimeResult.
 *
 * Input Contract:
 * - laytimeResult: must be non-null/non-undefined
 * - laytimeResult.netHours: must be finite (not NaN, not ±Infinity)
 * - demurrageRateUsdPerDay: must be finite (not NaN, not ±Infinity)
 * - despatchRateUsdPerDay: if provided, must be finite (not NaN, not ±Infinity)
 *
 * Edge cases:
 * - Negative rates are accepted (will produce negative amounts)
 * - Zero rates are accepted (will produce zero amounts)
 * - Very large netHours are accepted (no overflow expected)
 *
 * @param input - DemurrageDespatchInput containing laytime result and rates
 * @returns DemurrageDespatchResult with amounts and breakdown
 * @throws Error if laytimeResult is null/undefined or netHours is not finite
 * @throws RangeError if demurrageRate or despatchRate (if provided) is not finite
 */
export function calculateDemurrageDespatch(
  input: DemurrageDespatchInput
): DemurrageDespatchResult {
  const { laytimeResult, demurrageRateUsdPerDay, despatchRateUsdPerDay } = input;

  // Input validation: laytimeResult must be present
  if (!laytimeResult) {
    throw new Error('laytimeResult is required');
  }

  // Input validation: netHours must be finite
  if (!Number.isFinite(laytimeResult.netHours)) {
    throw new Error('laytimeResult.netHours must be a finite number');
  }

  // Input validation: demurrageRate must be finite
  if (!Number.isFinite(demurrageRateUsdPerDay)) {
    throw new RangeError('demurrageRateUsdPerDay must be a finite number');
  }

  // Input validation: despatchRate (if provided) must be finite
  const despatchRate =
    despatchRateUsdPerDay !== undefined
      ? despatchRateUsdPerDay
      : demurrageRateUsdPerDay / 2;

  if (!Number.isFinite(despatchRate)) {
    throw new RangeError('despatchRateUsdPerDay must be a finite number');
  }

  const netHours = laytimeResult.netHours;

  let status: 'demurrage' | 'despatch' | 'balanced';
  let demurrageAmount = 0;
  let despatchAmount = 0;
  let demurrageHours = 0;
  let despatchHours = 0;

  if (netHours > 0) {
    // Demurrage case: used more time than allowed
    status = 'demurrage';
    demurrageHours = netHours;
    demurrageAmount = (netHours / 24) * demurrageRateUsdPerDay;
  } else if (netHours < 0) {
    // Despatch case: finished earlier than allowed
    status = 'despatch';
    despatchHours = Math.abs(netHours);
    despatchAmount = (Math.abs(netHours) / 24) * despatchRate;
  } else {
    // Balanced case: exactly on time
    status = 'balanced';
  }

  // netAmount: positive = you pay (demurrage), negative = you earn (despatch)
  const netAmount = demurrageAmount - despatchAmount;

  return {
    status,
    netHours,
    demurrageAmount,
    despatchAmount,
    netAmount,
    breakdown: {
      demurrageRate: demurrageRateUsdPerDay,
      despatchRate,
      demurrageHours,
      despatchHours,
    },
  };
}
