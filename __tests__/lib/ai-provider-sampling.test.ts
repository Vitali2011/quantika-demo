import { describe, it, expect } from "@jest/globals";
import type { AiOpts } from "@/lib/ai-provider";
import { buildGeminiSamplingFields, buildBedrockSamplingFields } from "@/lib/ai-provider";

describe("AiOpts sampling fields", () => {
  it("accepts temperature option", () => {
    const opts: AiOpts = { temperature: 0 };
    expect(opts.temperature).toBe(0);
  });

  it("accepts seed option", () => {
    const opts: AiOpts = { seed: 42 };
    expect(opts.seed).toBe(42);
  });

  it("allows topP and topK options", () => {
    const opts: AiOpts = { topP: 0.95, topK: 40 };
    expect(opts.topP).toBe(0.95);
    expect(opts.topK).toBe(40);
  });
});

describe("buildGeminiSamplingFields", () => {
  it("passes temperature into config", () => {
    const cfg = buildGeminiSamplingFields({ temperature: 0, maxTokens: 4096 });
    expect(cfg.temperature).toBe(0);
  });

  it("passes seed into config", () => {
    const cfg = buildGeminiSamplingFields({ seed: 42 });
    expect(cfg.seed).toBe(42);
  });

  it("omits undefined sampling options", () => {
    const cfg = buildGeminiSamplingFields({});
    expect(cfg.temperature).toBeUndefined();
    expect(cfg.seed).toBeUndefined();
    expect(cfg.topP).toBeUndefined();
    expect(cfg.topK).toBeUndefined();
  });

  it("includes all provided sampling fields", () => {
    const cfg = buildGeminiSamplingFields({ temperature: 0.3, topP: 0.95, topK: 40, seed: 1 });
    expect(cfg.temperature).toBe(0.3);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.topK).toBe(40);
    expect(cfg.seed).toBe(1);
  });
});

describe("buildBedrockSamplingFields", () => {
  it("sets max_tokens from maxTokens", () => {
    const cfg = buildBedrockSamplingFields({ maxTokens: 4096 });
    expect(cfg.max_tokens).toBe(4096);
  });

  it("defaults max_tokens to 16000", () => {
    const cfg = buildBedrockSamplingFields({});
    expect(cfg.max_tokens).toBe(16000);
  });

  it("passes temperature", () => {
    const cfg = buildBedrockSamplingFields({ temperature: 0 });
    expect(cfg.temperature).toBe(0);
  });

  it("maps topP to top_p (Anthropic format)", () => {
    const cfg = buildBedrockSamplingFields({ topP: 0.95 });
    expect(cfg.top_p).toBe(0.95);
  });

  it("omits temperature and top_p when not provided", () => {
    const cfg = buildBedrockSamplingFields({});
    expect(cfg.temperature).toBeUndefined();
    expect(cfg.top_p).toBeUndefined();
  });
});
