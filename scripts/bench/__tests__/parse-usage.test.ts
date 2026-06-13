import { parseUsage } from "../parse-usage";

describe("parseUsage", () => {
  it("extracts cost, duration, and tokens from claude --output-format json", () => {
    const raw = JSON.stringify({
      type: "result",
      subtype: "success",
      total_cost_usd: 0.1234,
      duration_ms: 45000,
      num_turns: 7,
      usage: { input_tokens: 1200, output_tokens: 3400 },
      result: "done",
    });
    expect(parseUsage(raw)).toEqual({
      costUsd: 0.1234,
      durationMs: 45000,
      inTokens: 1200,
      outTokens: 3400,
      turns: 7,
    });
  });

  it("defaults missing fields to 0 rather than NaN", () => {
    expect(parseUsage(JSON.stringify({ type: "result" }))).toEqual({
      costUsd: 0,
      durationMs: 0,
      inTokens: 0,
      outTokens: 0,
      turns: 0,
    });
  });

  it("throws a clear error on non-JSON", () => {
    expect(() => parseUsage("not json")).toThrow(/parse-usage: invalid JSON/);
  });
});
