// Regression Lock: QA adversarial 2026-05-12
// Class: B (Special floats) | Severity: HIGH
// Finding: B-01 — NaN in weatherDelayHours from invalid arithmetic
// Spec: gamma-06-sof-parser
// DO NOT DELETE — see references/regression_lock_workflow.md

import { parseSof } from "@/lib/laytime/sof-parser";

describe("regression gamma-06-B-01: NaN in weatherDelayHours must be rejected", () => {
  it("invalid timestamp arithmetic must not produce NaN hours", () => {
    // This SOF has valid format but the date parsing might fail internally
    const sof = `
2026-05-01 10:00 - Weather delay start
2026-05-01 16:00 - Weather delay end
`;
    const result = parseSof(sof);
    
    // CRITICAL: weatherDelayHours must NEVER be NaN
    expect(result.weatherDelayHours).not.toBeNaN();
    expect(typeof result.weatherDelayHours).toBe("number");
    expect(Number.isFinite(result.weatherDelayHours)).toBe(true);
  });

  it("empty weather delay events must produce 0 hours, not NaN", () => {
    const sof = `
2026-05-01 10:00 - Weather delay started
`;
    const result = parseSof(sof);
    
    // No matching end → 0 hours accumulated
    expect(result.weatherDelayHours).toBe(0);
    expect(result.weatherDelayHours).not.toBeNaN();
  });

  it("division by zero guard: weatherDelayHours calculation must handle edge cases", () => {
    // Same timestamp for start and end → 0 ms delta
    const sof = `
2026-05-01 10:00 - Weather delay start
2026-05-01 10:00 - Weather delay end
`;
    const result = parseSof(sof);
    
    // 0 ms / (1000 * 60 * 60) = 0.0 hours, NOT NaN
    expect(result.weatherDelayHours).toBe(0);
    expect(result.weatherDelayHours).not.toBeNaN();
  });
});
