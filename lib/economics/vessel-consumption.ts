const DEFAULT_CONS_MT_PER_DAY = 28;
const IMPLAUSIBLE_CONS_FACTOR = 1.8;

/**
 * Estimate laden VLSFO consumption (t/day) from vessel DWT when no Q88 data.
 * Midpoints of realistic laden-service ranges per class.
 * DWT=0 (unknown) → Supramax representative (28 t/day).
 */
export function consFromDwt(dwt: number): number {
  if (dwt <= 0)       return DEFAULT_CONS_MT_PER_DAY;
  if (dwt <= 5_000)   return 6;   // coaster / small MPP
  if (dwt <= 10_000)  return 10;  // small general cargo
  if (dwt <= 35_000)  return 18;  // handysize
  if (dwt <= 60_000)  return 28;  // supra/handymax
  if (dwt <= 85_000)  return 33;  // panamax
  return 40;                       // capesize / VLCC
}

/**
 * Resolve vessel consumption (t/day) from stored Q88 value and DWT class.
 * - stored <= 0   → DWT-class estimate (missing/zero data)
 * - stored > classEst × 1.8 → classEst (implausible — e.g. 22 t/day on a 3200 DWT coaster)
 * - else → stored as-is
 */
export function resolveConsMtPerDay(stored: number, dwt: number): number {
  const classEst = consFromDwt(dwt);
  if (stored <= 0) return classEst;
  if (stored > classEst * IMPLAUSIBLE_CONS_FACTOR) return classEst;
  return stored;
}
