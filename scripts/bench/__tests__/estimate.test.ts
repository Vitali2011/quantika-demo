import { extrapolate } from "../estimate";

describe("extrapolate", () => {
  it("scales one pilot run to the full matrix with a safety factor", () => {
    const r = extrapolate({
      pilotCostUsd: 2,
      pilotDurationMs: 600000,
      arms: 6,
      repeats: 3,
      safety: 1.3,
    });
    expect(r.runs).toBe(18);
    expect(r.estCostUsd).toBeCloseTo(46.8, 5); // 2 * 18 * 1.3
    expect(r.estWallClockHoursSerial).toBeCloseTo(3, 5); // 18 * 10min / 60
  });
});
