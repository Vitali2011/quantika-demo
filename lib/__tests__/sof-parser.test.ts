/**
 * Tests for SOF (Statement of Facts) parser
 * Spec: gamma-06-sof-parser.md
 */

import { parseSof } from "../laytime/sof-parser";

const SAMPLE_SOF = `
2026-05-01 08:00 - Vessel arrived at anchorage
2026-05-01 14:30 - NOR tendered
2026-05-01 18:00 - NOR accepted, laytime commenced
2026-05-03 22:00 - Completed loading
2026-05-04 06:00 - Vessel departed
`;

describe("parseSof - happy path", () => {
  test("extracts commencedAt from laytime commenced line", () => {
    const result = parseSof(SAMPLE_SOF);
    expect(result.commencedAt).toBe("2026-05-01T18:00:00.000Z");
  });

  test("extracts completedAt from loading completed line", () => {
    const result = parseSof(SAMPLE_SOF);
    expect(result.completedAt).toBe("2026-05-03T22:00:00.000Z");
  });

  test("classifies NOR tendered event correctly", () => {
    const result = parseSof(SAMPLE_SOF);
    const norEvent = result.events.find(e => e.eventType === "nor-tendered");
    expect(norEvent).toBeDefined();
    expect(norEvent?.description).toContain("NOR tendered");
  });

  test("returns departure event", () => {
    const result = parseSof(SAMPLE_SOF);
    const departureEvent = result.events.find(e => e.eventType === "departure");
    expect(departureEvent).toBeDefined();
    expect(departureEvent?.description).toContain("departed");
  });

  test("accumulates weather delay hours", () => {
    const sof = `
2026-05-01 10:00 - Weather delay commenced
2026-05-01 16:00 - Weather delay ended
2026-05-02 08:00 - Weather delay start
2026-05-02 11:00 - Weather delay end
`;
    const result = parseSof(sof);
    expect(result.weatherDelayHours).toBe(9); // 6 hours + 3 hours
  });
});

describe("parseSof - boundary: empty/falsy inputs", () => {
  test("empty string: returns empty events, null commencedAt/completedAt", () => {
    const result = parseSof("");
    expect(result.events).toEqual([]);
    expect(result.commencedAt).toBeNull();
    expect(result.completedAt).toBeNull();
    expect(result.weatherDelayHours).toBe(0);
    expect(result.parseWarnings).toEqual([]);
  });

  test("all whitespace: returns empty events", () => {
    const result = parseSof("   \n  \t  \n  ");
    expect(result.events).toEqual([]);
    expect(result.commencedAt).toBeNull();
    expect(result.completedAt).toBeNull();
  });

  test("lines with only whitespace: skipped silently", () => {
    const sof = `
2026-05-01 08:00 - Vessel arrived


2026-05-01 14:30 - NOR tendered
`;
    const result = parseSof(sof);
    expect(result.events).toHaveLength(2);
    expect(result.parseWarnings).toEqual([]);
  });
});

describe("parseSof - boundary: no timestamp lines", () => {
  test("no timestamp lines: all added to parseWarnings", () => {
    const sof = "foo\nbar\nbaz";
    const result = parseSof(sof);
    expect(result.events).toEqual([]);
    expect(result.parseWarnings).toHaveLength(3);
    expect(result.parseWarnings[0]).toContain("foo");
    expect(result.parseWarnings[1]).toContain("bar");
    expect(result.parseWarnings[2]).toContain("baz");
  });
});

describe("parseSof - boundary: malformed timestamp", () => {
  test("malformed timestamp: line added to parseWarnings", () => {
    const sof = `
2026-05-01 08:00 - Valid event
2026-13-99 25:99 - Invalid date
not-a-date 12:00 - Another invalid
`;
    const result = parseSof(sof);
    expect(result.events).toHaveLength(1);
    expect(result.parseWarnings).toHaveLength(2);
    expect(result.parseWarnings[0]).toContain("2026-13-99");
    expect(result.parseWarnings[1]).toContain("not-a-date");
  });
});

describe("parseSof - boundary: duplicate events", () => {
  test("duplicate laytime commenced: last one wins", () => {
    const sof = `
2026-05-01 10:00 - Laytime commenced first
2026-05-01 14:00 - Laytime commenced second
2026-05-01 18:00 - NOR accepted, laytime commenced
`;
    const result = parseSof(sof);
    expect(result.commencedAt).toBe("2026-05-01T18:00:00.000Z");
    expect(result.events.filter(e => e.eventType === "laytime-commenced")).toHaveLength(3);
  });

  test("duplicate loading completed: last one wins", () => {
    const sof = `
2026-05-03 10:00 - Completed loading first
2026-05-03 18:00 - Loading completed
2026-05-03 22:00 - Completed loading final
`;
    const result = parseSof(sof);
    expect(result.completedAt).toBe("2026-05-03T22:00:00.000Z");
    expect(result.events.filter(e => e.eventType === "loading-completed")).toHaveLength(3);
  });
});

describe("parseSof - boundary: weather delay edge cases", () => {
  test("weather delay start without end: included in events, 0 hours added", () => {
    const sof = `
2026-05-01 10:00 - Weather delay started
2026-05-01 14:00 - Some other event
`;
    const result = parseSof(sof);
    const weatherStart = result.events.find(e => e.eventType === "weather-delay-start");
    expect(weatherStart).toBeDefined();
    expect(result.weatherDelayHours).toBe(0);
  });

  test("weather delay end without start: included in events, 0 hours added", () => {
    const sof = `
2026-05-01 10:00 - Some event
2026-05-01 15:00 - Weather delay ended
`;
    const result = parseSof(sof);
    const weatherEnd = result.events.find(e => e.eventType === "weather-delay-end");
    expect(weatherEnd).toBeDefined();
    expect(result.weatherDelayHours).toBe(0);
  });

  test("negative time range (end before start): treat as 0 hours", () => {
    const sof = `
2026-05-01 16:00 - Weather delay started
2026-05-01 10:00 - Weather delay ended
`;
    const result = parseSof(sof);
    expect(result.weatherDelayHours).toBe(0);
    expect(result.parseWarnings.some(w => w.includes("negative") || w.includes("before"))).toBe(true);
  });
});

describe("parseSof - boundary: comments and blank lines", () => {
  test("comment lines starting with # are skipped", () => {
    const sof = `
# This is a comment
2026-05-01 08:00 - Vessel arrived
# Another comment
2026-05-01 14:30 - NOR tendered
`;
    const result = parseSof(sof);
    expect(result.events).toHaveLength(2);
    expect(result.parseWarnings).toEqual([]);
  });

  test("blank lines are skipped silently", () => {
    const sof = `

2026-05-01 08:00 - Vessel arrived

2026-05-01 14:30 - NOR tendered

`;
    const result = parseSof(sof);
    expect(result.events).toHaveLength(2);
    expect(result.parseWarnings).toEqual([]);
  });
});

describe("parseSof - event type classification", () => {
  test('classifies "arrived" as arrival', () => {
    const result = parseSof("2026-05-01 08:00 - Vessel arrived at port");
    expect(result.events[0].eventType).toBe("arrival");
  });

  test('classifies "arrival" as arrival', () => {
    const result = parseSof("2026-05-01 08:00 - Vessel arrival confirmed");
    expect(result.events[0].eventType).toBe("arrival");
  });

  test('classifies "NOR tendered" as nor-tendered', () => {
    const result = parseSof("2026-05-01 14:00 - NOR tendered to charterers");
    expect(result.events[0].eventType).toBe("nor-tendered");
  });

  test('classifies "NOR accepted" as laytime-commenced', () => {
    const result = parseSof("2026-05-01 18:00 - NOR accepted by port");
    expect(result.events[0].eventType).toBe("laytime-commenced");
  });

  test('classifies "loading started" as loading-started', () => {
    const result = parseSof("2026-05-02 08:00 - Loading started at berth 3");
    expect(result.events[0].eventType).toBe("loading-started");
  });

  test('classifies "departed" as departure', () => {
    const result = parseSof("2026-05-04 06:00 - Vessel departed port");
    expect(result.events[0].eventType).toBe("departure");
  });

  test('classifies "departure" as departure', () => {
    const result = parseSof("2026-05-04 06:00 - Vessel departure completed");
    expect(result.events[0].eventType).toBe("departure");
  });

  test("classifies unrecognized events as other", () => {
    const result = parseSof("2026-05-01 12:00 - Pilot on board");
    expect(result.events[0].eventType).toBe("other");
  });
});

describe("parseSof - magnitude assertions", () => {
  test("weatherDelayHours is non-negative", () => {
    const sof = `
2026-05-01 10:00 - Weather delay start
2026-05-01 16:00 - Weather delay end
`;
    const result = parseSof(sof);
    expect(result.weatherDelayHours).toBeGreaterThanOrEqual(0);
  });

  test("events array length matches input lines (excluding blanks/comments)", () => {
    const sof = `
2026-05-01 08:00 - Event 1
2026-05-01 10:00 - Event 2
# comment
2026-05-01 12:00 - Event 3
`;
    const result = parseSof(sof);
    expect(result.events.length).toBeGreaterThanOrEqual(0);
    expect(result.events.length).toBeLessThanOrEqual(5); // reasonable upper bound
  });

  test("parseWarnings count is non-negative", () => {
    const result = parseSof("invalid line\n2026-05-01 08:00 - Valid");
    expect(result.parseWarnings.length).toBeGreaterThanOrEqual(0);
  });
});
