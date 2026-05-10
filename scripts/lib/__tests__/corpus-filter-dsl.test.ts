import { parseDsl, matchesFilter, Predicate } from "../corpus-filter-dsl";

describe("parseDsl", () => {
  it("parses body matches /regex/i", () => {
    const result = parseDsl("body matches /DWCC/i");
    expect(result.error).toBeUndefined();
    expect(result.predicates).toHaveLength(1);
    const pred = result.predicates![0];
    expect(pred.field).toBe("body");
    expect(pred.op).toBe("matches");
    expect(pred.value).toBeInstanceOf(RegExp);
    expect((pred.value as RegExp).flags).toContain("i");
  });

  it("parses body contains", () => {
    const result = parseDsl('body contains "open position"');
    expect(result.error).toBeUndefined();
    expect(result.predicates![0]).toMatchObject({
      field: "body",
      op: "contains",
      value: "open position",
    });
  });

  it("parses subject contains", () => {
    const result = parseDsl('subject contains "Vessel"');
    expect(result.error).toBeUndefined();
    expect(result.predicates![0].field).toBe("subject");
  });

  it("parses from contains", () => {
    const result = parseDsl('from contains "broker@"');
    expect(result.error).toBeUndefined();
    expect(result.predicates![0].field).toBe("from");
  });

  it("parses multiple predicates with AND", () => {
    const result = parseDsl('body matches /DWCC/i AND subject contains "open"');
    expect(result.error).toBeUndefined();
    expect(result.predicates).toHaveLength(2);
  });

  it("returns error for unknown field", () => {
    const result = parseDsl('date contains "2026"');
    expect(result.error).toBeDefined();
    expect(result.predicates).toBeUndefined();
  });

  it("returns error for missing regex delimiters with matches op", () => {
    const result = parseDsl("body matches DWCC");
    expect(result.error).toBeDefined();
  });

  it("returns error for unquoted value with contains op", () => {
    const result = parseDsl("body contains hello");
    expect(result.error).toBeDefined();
  });

  it("returns error for empty expression", () => {
    const result = parseDsl("");
    expect(result.error).toBeDefined();
  });

  it("returns error for invalid regex", () => {
    const result = parseDsl("body matches /[invalid/i");
    expect(result.error).toBeDefined();
  });
});

describe("matchesFilter", () => {
  const sampleEmail = {
    subject: "Open Position M/V Pacific Star",
    body: "DWCC 32000mt, vessel available Hamburg",
    from: "broker@seaship.com",
  };

  it("matches body with regex", () => {
    const { predicates } = parseDsl("body matches /DWCC/i") as { predicates: Predicate[] };
    expect(matchesFilter(sampleEmail, predicates)).toBe(true);
  });

  it("no match when regex doesn't match", () => {
    const { predicates } = parseDsl("body matches /TANKER/i") as { predicates: Predicate[] };
    expect(matchesFilter(sampleEmail, predicates)).toBe(false);
  });

  it("matches body contains (case-insensitive)", () => {
    const { predicates } = parseDsl('body contains "dwcc"') as { predicates: Predicate[] };
    expect(matchesFilter(sampleEmail, predicates)).toBe(true);
  });

  it("matches subject contains", () => {
    const { predicates } = parseDsl('subject contains "Pacific"') as { predicates: Predicate[] };
    expect(matchesFilter(sampleEmail, predicates)).toBe(true);
  });

  it("matches from contains", () => {
    const { predicates } = parseDsl('from contains "seaship"') as { predicates: Predicate[] };
    expect(matchesFilter(sampleEmail, predicates)).toBe(true);
  });

  it("AND: both must match", () => {
    const { predicates } = parseDsl(
      'body matches /DWCC/i AND subject contains "Pacific"'
    ) as { predicates: Predicate[] };
    expect(matchesFilter(sampleEmail, predicates)).toBe(true);
  });

  it("AND: fails if any predicate fails", () => {
    const { predicates } = parseDsl(
      'body matches /DWCC/i AND subject contains "TANKER"'
    ) as { predicates: Predicate[] };
    expect(matchesFilter(sampleEmail, predicates)).toBe(false);
  });

  it("handles missing field (empty string)", () => {
    const { predicates } = parseDsl('from contains "broker"') as { predicates: Predicate[] };
    expect(matchesFilter({ subject: "test" }, predicates)).toBe(false);
  });

  it("empty predicates list matches everything", () => {
    expect(matchesFilter(sampleEmail, [])).toBe(true);
  });
});
