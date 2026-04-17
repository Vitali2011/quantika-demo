import { formatPortName } from "@/lib/utils/format-port-name";

describe("formatPortName", () => {
  it('converts all-caps to Title Case: "ROTTERDAM" → "Rotterdam"', () => {
    expect(formatPortName("ROTTERDAM")).toBe("Rotterdam");
  });

  it('trims whitespace: "  antwerp  " → "Antwerp"', () => {
    expect(formatPortName("  antwerp  ")).toBe("Antwerp");
  });

  it('handles multi-word lowercase: "new york" → "New York"', () => {
    expect(formatPortName("new york")).toBe("New York");
  });

  it('preserves parenthetical suffix: "HAMBURG (ELBE)" → "Hamburg (Elbe)"', () => {
    expect(formatPortName("HAMBURG (ELBE)")).toBe("Hamburg (Elbe)");
  });

  it('collapses internal spaces: "  port   said  " → "Port Said"', () => {
    expect(formatPortName("  port   said  ")).toBe("Port Said");
  });

  it('returns empty string for empty input: "" → ""', () => {
    expect(formatPortName("")).toBe("");
  });

  it('returns empty string for null input', () => {
    expect(formatPortName(null)).toBe("");
  });

  it('returns empty string for undefined input', () => {
    expect(formatPortName(undefined)).toBe("");
  });
});
