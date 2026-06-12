// Regression Lock: QA adversarial 2026-05-12
// Class: 9 (End-to-end property) | Severity: HIGH
// Finding: 9-01 — API response contract violations (status + shape mismatch)
// Spec: gamma-06-sof-parser
// DO NOT DELETE — see references/regression_lock_workflow.md

// parseSof is wrapped in a jest.fn passthrough at module level: ts-jest emits
// non-configurable ESM exports, so jest.spyOn inside a test body throws
// "Cannot redefine property: parseSof". The wrapper keeps real behavior for all
// tests; the 500-contract test overrides it with mockImplementationOnce.
jest.mock("@/lib/laytime/sof-parser", () => {
  const actual = jest.requireActual("@/lib/laytime/sof-parser");
  return { ...actual, parseSof: jest.fn(actual.parseSof) };
});

import { POST } from "@/app/api/laytime/parse-sof/route";
import * as sofParser from "@/lib/laytime/sof-parser";
import { NextRequest } from "next/server";

// Mock CSRF to pass (we're testing response contract, not auth)
jest.mock("@/lib/csrf", () => ({
  validateCsrf: jest.fn(() => true),
}));

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/laytime/parse-sof", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("regression gamma-06-9-01: API response contract verification", () => {
  const originalEnv = process.env.LAYTIME_ENGINE_ENABLED;

  beforeEach(() => {
    process.env.LAYTIME_ENGINE_ENABLED = "true";
  });

  afterEach(() => {
    process.env.LAYTIME_ENGINE_ENABLED = originalEnv;
  });

  it("400 response must have .error field, NOT success data", async () => {
    const request = createRequest({});
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty("error");
    expect(typeof data.error).toBe("string");
    
    // CRITICAL: must NOT have SofParseResult fields on error
    expect(data).not.toHaveProperty("events");
    expect(data).not.toHaveProperty("commencedAt");
  });

  it("500 response must have .error field and must NOT reflect raw error details", async () => {
    // Re-pinned after L-8 hardening (#686): the route logs server-side and returns a
    // generic {error} body — `.details` (raw error reflection) was removed deliberately.
    // This now pins the L-8 invariant: internal error text never reaches the client.
    (sofParser.parseSof as jest.Mock).mockImplementationOnce(() => {
      throw new Error("Forced error");
    });

    const request = createRequest({ text: "valid text" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toHaveProperty("error");
    expect(typeof data.error).toBe("string");
    expect(data).not.toHaveProperty("details");
    expect(JSON.stringify(data)).not.toContain("Forced error");
  });

  it("200 response must have SofParseResult shape, NOT .error field", async () => {
    const request = createRequest({ text: "2026-05-01 08:00 - Vessel arrived" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    
    // CRITICAL: success response must have expected fields
    expect(data).toHaveProperty("events");
    expect(Array.isArray(data.events)).toBe(true);
    expect(data).toHaveProperty("commencedAt");
    expect(data).toHaveProperty("completedAt");
    expect(data).toHaveProperty("weatherDelayHours");
    expect(data).toHaveProperty("parseWarnings");
    
    // CRITICAL: success response must NOT have .error field
    expect(data).not.toHaveProperty("error");
  });

  it("503 feature disabled response must have .error, correct status", async () => {
    process.env.LAYTIME_ENGINE_ENABLED = "false";
    const request = createRequest({ text: "test" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("not enabled");
  });
});
