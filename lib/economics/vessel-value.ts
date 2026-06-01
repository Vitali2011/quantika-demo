/**
 * Rough vessel asset-value estimate for Suez vs Cape financial comparison.
 * Based on ~2023-2025 second-hand bulk-carrier market, $/dwt by size class:
 *   Handysize (<40 k)   280 $/dwt
 *   Supramax/Ultramax   260 $/dwt
 *   Panamax/Kamsarmax   220 $/dwt
 *   Capesize+           180 $/dwt
 * Not for insurance, lending, or commercial negotiations.
 */
export function estimateVesselValueUsd(dwt: number): number {
  if (dwt <= 0) return 22_000_000; // unknown size — generic industry fallback
  if (dwt < 40_000) return Math.round(dwt * 280);
  if (dwt < 65_000) return Math.round(dwt * 260);
  if (dwt < 100_000) return Math.round(dwt * 220);
  return Math.round(dwt * 180);
}
