export function breakevenTceByDwt(dwt: number): number {
  if (dwt <= 15_000) return 1_500;
  if (dwt <= 40_000) return 3_000;
  if (dwt <= 65_000) return 5_500;
  return 7_500;
}
