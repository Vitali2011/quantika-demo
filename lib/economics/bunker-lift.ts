/**
 * Estimate required bunker lift for a voyage.
 *
 * `liftTonnes` is `(voyageDays + reserveDays) * dailyConsMtPerDay`, then
 * clamped to vessel bunker tank capacity ≈ `dwt * capRatio` (7% DWT is the
 * handysize/supramax industry default — tanks are sized to that fraction so
 * a fully-laden voyage can carry both cargo and fuel without trimming).
 *
 * Inputs ≤ 0 are treated as "unknown" and the function returns a conservative
 * 100 mt default so a partially-populated demo match still renders a finite
 * number instead of NaN.
 *
 * Bug-2 motivation: prior code passed `cargo.weightMt` (cargo, not fuel) into
 * the lift display, producing "залить ~2720 т" on a 10000-DWT handysize whose
 * tank caps at ~700 mt. Cargo weight is not bunker.
 */
export interface BunkerLiftInput {
  /** Vessel deadweight in mt. 0 = unknown → no capacity cap. */
  dwt: number;
  /** Daily consumption (laden) in mt/day. 0 = unknown → conservative fallback. */
  dailyConsMtPerDay: number;
  /** Estimated voyage duration in days. 0 = unknown → conservative fallback. */
  voyageDays: number;
  /** Reserve buffer in days; industry typical 5–7. Default 5. */
  reserveDays?: number;
  /** Bunker tank fraction of DWT; handysize/supramax ~0.07. Default 0.07. */
  capRatio?: number;
}

export interface BunkerLiftResult {
  /** Required bunker tonnes for this voyage, capped by tank capacity. */
  liftTonnes: number;
  /** Vessel bunker tank capacity in mt (`dwt * capRatio`); 0 if dwt unknown. */
  capacityMt: number;
  /** True if raw demand was clamped to capacity (voyage exceeds vessel range). */
  capped: boolean;
}

const FALLBACK_LIFT_MT = 100;

export function estimateBunkerLift(input: BunkerLiftInput): BunkerLiftResult {
  const dwt = Math.max(0, input.dwt);
  const cons = Math.max(0, input.dailyConsMtPerDay);
  const days = Math.max(0, input.voyageDays);
  const reserveDays = input.reserveDays ?? 5;
  const capRatio = input.capRatio ?? 0.07;

  const capacityMt = dwt > 0 ? Math.floor(dwt * capRatio) : 0;

  if (cons === 0 || days === 0) {
    return { liftTonnes: FALLBACK_LIFT_MT, capacityMt, capped: false };
  }

  const liftRaw = (days + reserveDays) * cons;
  const liftCeiled = Math.ceil(liftRaw);

  if (dwt === 0) {
    return { liftTonnes: liftCeiled, capacityMt: 0, capped: false };
  }

  if (liftCeiled > capacityMt) {
    return { liftTonnes: capacityMt, capacityMt, capped: true };
  }

  return { liftTonnes: liftCeiled, capacityMt, capped: false };
}
