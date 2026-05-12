// Regression Lock: QA adversarial 2026-05-12
// Class: F (Substring matching) | Severity: HIGH
// Finding: F-02 — Order-dependent classification edge cases
// Spec: gamma-06-sof-parser
// DO NOT DELETE — see references/regression_lock_workflow.md

import { parseSof } from "@/lib/laytime/sof-parser";

describe("regression gamma-06-F-02: order-dependent event classification", () => {
  it("'Completed loading departure preparations' should be loading-completed, not departure", () => {
    const sof = "2026-05-03 20:00 - Completed loading departure preparations";
    const result = parseSof(sof);
    
    // Expected: "loading-completed" (line 179 checks this before line 191 "departed")
    // Risk: if "departure" substring check happens first
    expect(result.events[0].eventType).toBe("loading-completed");
    expect(result.completedAt).toBe("2026-05-03T20:00:00.000Z");
  });

  it("'Vessel departed after loading completed' should be departure, not loading-completed", () => {
    const sof = "2026-05-04 06:00 - Vessel departed after loading completed";
    const result = parseSof(sof);
    
    // Contains both "departed" and "loading completed"
    // Expected: first match wins — check if order is arrival < ... < departure
    // Line 191: "departed" / "departure" → departure
    // Line 179: "completed loading" / "loading completed" → loading-completed
    // "departed" appears first in string, but which check runs first?
    expect(result.events[0].eventType).toBe("departure");
    expect(result.completedAt).toBeNull(); // should NOT extract from departure line
  });

  it("'NOR accepted after laytime commenced earlier' should be laytime-commenced", () => {
    const sof = "2026-05-01 18:00 - NOR accepted after laytime commenced earlier";
    const result = parseSof(sof);
    
    // Contains both "nor accepted" and "laytime commenced"
    // Line 170: checks both "nor accepted" AND "laytime commenced"
    // Expected: laytime-commenced (single check covers both phrases)
    expect(result.events[0].eventType).toBe("laytime-commenced");
    expect(result.commencedAt).toBe("2026-05-01T18:00:00.000Z");
  });

  it("'Arrival at departure anchorage' should be arrival, not departure", () => {
    const sof = "2026-05-01 08:00 - Arrival at departure anchorage";
    const result = parseSof(sof);
    
    // Contains both "arrival" and "departure"
    // Line 160: "arrived" / "arrival" → arrival
    // Line 191: "departed" / "departure" → departure
    // "Arrival" comes first in code check order → should be "arrival"
    expect(result.events[0].eventType).toBe("arrival");
  });
});
