export interface ExpectedNum { value: number; toleranceAbs?: number; tolerancePct?: number }

export function withinTolerance(actual: number, exp: ExpectedNum): boolean {
  const absBand = exp.toleranceAbs ?? 0;
  const pctBand = exp.tolerancePct != null ? Math.abs(exp.value) * (exp.tolerancePct / 100) : 0;
  const band = Math.max(absBand, pctBand);
  return Math.abs(actual - exp.value) <= band;
}
