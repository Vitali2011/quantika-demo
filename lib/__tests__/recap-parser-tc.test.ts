import { classifyRecapType } from "@/lib/recap-parser";

describe("classifyRecapType", () => {
  it("detects TC via DELY/REDELY", () => {
    expect(classifyRecapType("DELY: WAfrica / REDELY: Singapore")).toBe("TC");
  });

  it("detects TC via TCT and hire rate", () => {
    expect(classifyRecapType("1 TCT ppt onwards, hire rate $12,000/day")).toBe("TC");
  });

  it("detects TC via time charter phrase", () => {
    expect(classifyRecapType("Time charter trip for 3 months")).toBe("TC");
  });

  it("detects VOYAGE with multiple markers", () => {
    expect(
      classifyRecapType(
        "Load port: Rotterdam, discharge port: Houston, freight rate $25/MT, laycan 15-20 May"
      )
    ).toBe("VOYAGE");
  });

  it("detects VOYAGE with minimal marker (freight rate only)", () => {
    expect(classifyRecapType("Freight rate USD 18.50 PMT")).toBe("VOYAGE");
  });

  it("returns UNKNOWN for empty string", () => {
    expect(classifyRecapType("")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for whitespace-only input", () => {
    expect(classifyRecapType("   \n  ")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for irrelevant text", () => {
    expect(classifyRecapType("Hello, please confirm meeting")).toBe("UNKNOWN");
  });

  it("TC takes precedence over VOYAGE markers", () => {
    expect(classifyRecapType("DELY WAFR freight rate $25/MT laycan May")).toBe("TC");
  });

  it("classifies sample-13 body text as TC", () => {
    const body =
      "DELY: WAfrica int'l (Dakar, Senegal)\nREDELY: Singapore / Japan range\nDURATION: 1 TCT ppt onwards";
    expect(classifyRecapType(body)).toBe("TC");
  });
});
