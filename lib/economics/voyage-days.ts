/**
 * Estimate voyage duration from route distance and vessel speed.
 *
 * voyageDays = max(1, round(distanceNm / (speedKnots * 24)))
 *
 * Returns 0 when distance is missing/invalid (UI should treat as "n/a"
 * and skip downstream calc rather than substitute a fake constant).
 * Falls back to 12 kn when speed is missing/invalid.
 */
export function estimateVoyageDays(
  distanceNm: number | null | undefined,
  speedKnots: number | null | undefined,
): number {
  if (distanceNm == null || !Number.isFinite(distanceNm) || distanceNm <= 0) {
    return 0;
  }
  const speed =
    speedKnots != null && Number.isFinite(speedKnots) && speedKnots > 0 ? speedKnots : 12;
  const days = distanceNm / (speed * 24);
  return Math.max(1, Math.round(days));
}
