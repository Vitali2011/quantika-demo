// Regression Lock: QA adversarial 2026-05-12
// Class: F (Substring vs whole-word) | Severity: CRITICAL
// Finding: F-01 — classifyEventType substring false positives
// Spec: gamma-06-sof-parser
// DO NOT DELETE — see references/regression_lock_workflow.md

import { parseSof } from "@/lib/laytime/sof-parser";

describe("regression gamma-06-F-01: substring false positives in event classification", () => {
  it("'weather forecast' prose should NOT be classified as weather-delay-start", () => {
    const sof = "2026-05-01 10:00 - Weather forecast: possible delay tomorrow";
    const result = parseSof(sof);
    
    // Expected: "other" (prose mention, not actual event)
    // Actual: likely "weather-delay-start" due to line 203 logic
    expect(result.events[0].eventType).not.toBe("weather-delay-start");
    expect(result.events[0].eventType).toBe("other");
  });

  it("'DEPARTURE terminal' in arrival event should be classified as arrival, not departure", () => {
    const sof = "2026-05-01 08:00 - Vessel arrived at DEPARTURE terminal";
    const result = parseSof(sof);
    
    // Expected: "arrival" (first match wins)
    // Risk: if "departure" substring check happens before "arrived"
    expect(result.events[0].eventType).toBe("arrival");
  });

  it("'not accepted yet' in NOR tendered event should remain nor-tendered", () => {
    const sof = "2026-05-01 14:00 - NOR tendered but not accepted yet";
    const result = parseSof(sof);
    
    // Expected: "nor-tendered" (line 165 checks "nor tendered" before "nor accepted")
    // This should PASS, but verifying order correctness
    expect(result.events[0].eventType).toBe("nor-tendered");
  });

  it("'weather delay possible' advisory should be 'other', not weather-delay-start", () => {
    const sof = "2026-05-01 09:00 - Captain reports weather delay possible if wind increases";
    const result = parseSof(sof);
    
    // Expected: "other" (advisory, not actual delay start)
    // Actual: classifyEventType line 203: if (lower.includes("delay") && !lower.includes("end"))
    // This will FAIL — "delay" without "end" triggers weather-delay-start
    expect(result.events[0].eventType).toBe("other");
  });

  it("'weather conditions improved' should be 'other', not weather-delay-end", () => {
    const sof = "2026-05-01 16:00 - Weather conditions improved, operations resume";
    const result = parseSof(sof);
    
    // Expected: "other" (improvement ≠ delay ending)
    // Risk: if just checking for "weather" keyword loosely
    expect(result.events[0].eventType).toBe("other");
  });
});
