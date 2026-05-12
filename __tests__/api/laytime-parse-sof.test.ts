/**
 * API Tests for /api/laytime/parse-sof
 * Spec: gamma-06-sof-parser.md
 */

import { POST } from "@/app/api/laytime/parse-sof/route";
import { NextRequest } from "next/server";

// Mock CSRF validation
jest.mock("@/lib/csrf", () => ({
  validateCsrf: jest.fn(() => true),
}));

const SAMPLE_SOF = `
2026-05-01 08:00 - Vessel arrived at anchorage
2026-05-01 14:30 - NOR tendered
2026-05-01 18:00 - NOR accepted, laytime commenced
2026-05-03 22:00 - Completed loading
2026-05-04 06:00 - Vessel departed
`;

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/laytime/parse-sof", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/laytime/parse-sof", () => {
  const originalEnv = process.env.LAYTIME_ENGINE_ENABLED;

  beforeEach(() => {
    process.env.LAYTIME_ENGINE_ENABLED = "true";
  });

  afterEach(() => {
    process.env.LAYTIME_ENGINE_ENABLED = originalEnv;
  });

  describe("happy path", () => {
    test("returns parsed SOF result with 200 status", async () => {
      const request = createRequest({ text: SAMPLE_SOF });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events).toBeDefined();
      expect(data.commencedAt).toBe("2026-05-01T18:00:00.000Z");
      expect(data.completedAt).toBe("2026-05-03T22:00:00.000Z");
      expect(data.weatherDelayHours).toBe(0);
      expect(data.parseWarnings).toBeDefined();
    });

    test("handles empty SOF text", async () => {
      const request = createRequest({ text: "" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events).toEqual([]);
      expect(data.commencedAt).toBeNull();
      expect(data.completedAt).toBeNull();
    });
  });

  describe("boundary: feature flag disabled", () => {
    test("returns 503 when LAYTIME_ENGINE_ENABLED is not 'true'", async () => {
      process.env.LAYTIME_ENGINE_ENABLED = "false";
      const request = createRequest({ text: SAMPLE_SOF });
      const response = await POST(request);

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.error).toContain("not enabled");
    });

    test("returns 503 when LAYTIME_ENGINE_ENABLED is undefined", async () => {
      delete process.env.LAYTIME_ENGINE_ENABLED;
      const request = createRequest({ text: SAMPLE_SOF });
      const response = await POST(request);

      expect(response.status).toBe(503);
    });
  });

  describe("boundary: missing or invalid text field", () => {
    test("returns 400 when body is empty object", async () => {
      const request = createRequest({});
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("text");
    });

    test("returns 400 when text field is missing", async () => {
      const request = createRequest({ other: "value" });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("text");
    });

    test("returns 400 when text is null", async () => {
      const request = createRequest({ text: null });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("text");
    });

    test("returns 400 when text is not a string", async () => {
      const request = createRequest({ text: 123 });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("text");
    });

    test("returns 400 when text is an array", async () => {
      const request = createRequest({ text: ["line1", "line2"] });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("text");
    });
  });

  describe("boundary: invalid JSON", () => {
    test("returns 400 when body is not valid JSON", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/laytime/parse-sof",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: "not valid json{",
        }
      );
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("JSON");
    });
  });

  describe("magnitude assertions", () => {
    test("response status is within valid HTTP range", async () => {
      const request = createRequest({ text: SAMPLE_SOF });
      const response = await POST(request);

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThanOrEqual(599);
    });

    test("events array length is non-negative", async () => {
      const request = createRequest({ text: SAMPLE_SOF });
      const response = await POST(request);
      const data = await response.json();

      expect(data.events.length).toBeGreaterThanOrEqual(0);
    });

    test("weatherDelayHours is non-negative", async () => {
      const request = createRequest({ text: SAMPLE_SOF });
      const response = await POST(request);
      const data = await response.json();

      expect(data.weatherDelayHours).toBeGreaterThanOrEqual(0);
    });
  });
});
