import { meanReconScore, meanPassCount, parsePassCount } from "../aggregate-eval";

describe("meanReconScore", () => {
  it("averages root+location across runs, ignoring empty verdicts", () => {
    const rows = [
      { root: 2, location: 1 },
      { root: 1, location: 0 },
      {}, // empty/parse-fail → ignored
    ];
    const r = meanReconScore(rows);
    expect(r.n).toBe(2);
    expect(r.meanRoot).toBeCloseTo(1.5);
    expect(r.meanLocation).toBeCloseTo(0.5);
  });
  it("returns zeros and n=0 when no valid rows", () => {
    expect(meanReconScore([{}, {}])).toEqual({ n: 0, meanRoot: 0, meanLocation: 0 });
  });
});

describe("parsePassCount", () => {
  it("extracts passed count from a jest Tests: summary line", () => {
    expect(parsePassCount("Tests: 7 passed, 7 total")).toBe(7);
    expect(parsePassCount("Tests: 2 failed, 5 passed, 7 total")).toBe(5);
    expect(parsePassCount("Tests: 0 (no diff)")).toBe(0);
  });
});

describe("meanPassCount", () => {
  it("averages pass counts", () => {
    expect(meanPassCount([7, 7, 5]).mean).toBeCloseTo(6.333, 2);
    expect(meanPassCount([7, 7, 5]).n).toBe(3);
  });
});
