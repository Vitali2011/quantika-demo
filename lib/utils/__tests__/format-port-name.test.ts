import { formatPortName } from "@/lib/utils/format-port-name";

describe("formatPortName", () => {
  it('converts all-caps to title case: "ROTTERDAM" → "Rotterdam"', () => {
    expect(formatPortName("ROTTERDAM")).toBe("Rotterdam");
  });

  it('trims leading/trailing whitespace: "  antwerp  " → "Antwerp"', () => {
    expect(formatPortName("  antwerp  ")).toBe("Antwerp");
  });

  it('capitalises each word: "new york" → "New York"', () => {
    expect(formatPortName("new york")).toBe("New York");
  });

  it('handles parenthetical suffixes: "HAMBURG (ELBE)" → "Hamburg (Elbe)"', () => {
    expect(formatPortName("HAMBURG (ELBE)")).toBe("Hamburg (Elbe)");
  });

  it('collapses multiple internal spaces: "  port   said  " → "Port Said"', () => {
    expect(formatPortName("  port   said  ")).toBe("Port Said");
  });

  it('returns "" for empty string', () => {
    expect(formatPortName("")).toBe("");
  });

  it("returns \"\" for null", () => {
    expect(formatPortName(null)).toBe("");
  });

  it("returns \"\" for undefined", () => {
    expect(formatPortName(undefined)).toBe("");
  });
});
