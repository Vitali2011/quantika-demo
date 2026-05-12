// Regression Lock: QA adversarial 2026-05-12
// Class: B (Special floats) | Severity: HIGH
// Finding: B-02 — Infinity in time delta from extreme date ranges
// Spec: gamma-06-sof-parser
// DO NOT DELETE — see references/regression_lock_workflow.md

import { parseSof } from "@/lib/laytime/sof-parser";

describe("regression gamma-06-B-02: Infinity in weatherDelayHours must be rejected", () => {
  it("extreme future date should not produce Infinity hours", () => {
    const sof = `
2026-05-01 10:00 - Weather delay start
9999-12-31 23:59 - Weather delay end
`;
    const result = parseSof(sof);
    
    // CRITICAL: must not be Infinity (would break JSON serialization)
    expect(result.weatherDelayHours).not.toBe(Infinity);
    expect(Number.isFinite(result.weatherDelayHours)).toBe(true);
    
    // Should either:
    // 1. Cap at reasonable max (e.g., 1 million hours)
    // 2. Add to parseWarnings and set to 0
    // 3. Reject the event entirely
    if (result.weatherDelayHours > 0) {
      expect(result.weatherDelayHours).toBeLessThan(1_000_000); // sanity cap
    }
  });

  it("year 2099 vs year 2026 should produce finite, reasonable hours", () => {
    const sof = `
2026-05-01 10:00 - Weather delay start
2099-05-01 10:00 - Weather delay end
`;
    const result = parseSof(sof);
    
    // 73 years * 365 days * 24 hours ≈ 639,480 hours (large but finite)
    expect(Number.isFinite(result.weatherDelayHours)).toBe(true);
    expect(result.weatherDelayHours).toBeGreaterThan(0);
    expect(result.weatherDelayHours).toBeLessThan(1_000_000); // sanity check
  });

  it("negative Infinity from reversed extreme dates must not occur", () => {
    const sof = `
9999-12-31 23:59 - Weather delay start
2026-05-01 10:00 - Weather delay end
`;
    const result = parseSof(sof);
    
    // Negative time range → 0 hours per spec + warning
    expect(result.weatherDelayHours).not.toBe(-Infinity);
    expect(result.weatherDelayHours).toBe(0);
    expect(result.parseWarnings.length).toBeGreaterThan(0);
  });
});
