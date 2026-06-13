// Extrapolate one pilot run to the full benchmark matrix.

export interface EstimateInput {
  pilotCostUsd: number;
  pilotDurationMs: number;
  arms: number;
  repeats: number;
  safety: number; // multiplier for variance / heavier arms (opus-max > opus-med)
}
export interface Estimate {
  runs: number;
  estCostUsd: number;
  estWallClockHoursSerial: number;
}

export function extrapolate(i: EstimateInput): Estimate {
  const runs = i.arms * i.repeats;
  const estCostUsd = i.pilotCostUsd * runs * i.safety;
  const estWallClockHoursSerial = (i.pilotDurationMs * runs) / 1000 / 3600;
  return { runs, estCostUsd, estWallClockHoursSerial };
}
