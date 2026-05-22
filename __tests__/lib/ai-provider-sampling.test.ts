import { describe, it, expect } from "@jest/globals";
import type { AiOpts } from "@/lib/ai-provider";
import { buildGeminiSamplingFields, buildBedrockSamplingFields, buildGeminiHttpOptions } from "@/lib/ai-provider";

describe("AiOpts sampling fields", () => {
  it("accepts maxRetries option", () => {
    const opts: AiOpts = { maxRetries: 1 };
    expect(opts.maxRetries).toBe(1);
  });

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
    expect(cfg.maxOutputTokens).toBeUndefined();
  });

  it("includes all provided sampling fields", () => {
    const cfg = buildGeminiSamplingFields({ temperature: 0.3, topP: 0.95, topK: 40, seed: 1 });
    expect(cfg.temperature).toBe(0.3);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.topK).toBe(40);
    expect(cfg.seed).toBe(1);
  });

  it("maps maxTokens to maxOutputTokens for Gemini", () => {
    const cfg = buildGeminiSamplingFields({ maxTokens: 8192 });
    expect(cfg.maxOutputTokens).toBe(8192);
  });

  it("omits maxOutputTokens when maxTokens is not provided", () => {
    const cfg = buildGeminiSamplingFields({ temperature: 0.5 });
    expect(cfg.maxOutputTokens).toBeUndefined();
  });
});

describe("buildGeminiHttpOptions", () => {
  it("returns undefined when maxRetries is not set", () => {
    expect(buildGeminiHttpOptions({})).toBeUndefined();
  });

  it("maps maxRetries: 0 to attempts: 1 (no retries)", () => {
    const opts = buildGeminiHttpOptions({ maxRetries: 0 });
    expect(opts?.retryOptions?.attempts).toBe(1);
  });

  it("maps maxRetries: 1 to attempts: 2 (one retry)", () => {
    const opts = buildGeminiHttpOptions({ maxRetries: 1 });
    expect(opts?.retryOptions?.attempts).toBe(2);
  });

  it("maps maxRetries: 4 to attempts: 5 (matches Gemini default)", () => {
    const opts = buildGeminiHttpOptions({ maxRetries: 4 });
    expect(opts?.retryOptions?.attempts).toBe(5);
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
