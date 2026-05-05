/**
 * Tests for distances/client.ts - searoute service HTTP client
 *
 * Input Contract:
 * - origin/dest lat/lon: must be finite numbers in valid range [-90,90] / [-180,180]
 * - routeVia: must be one of 'suez' | 'cape' | 'panama' | 'direct'
 * - timeoutMs: if provided, must be >= 0
 * - retries: if provided, must be >= 0
 *
 * Error handling:
 * - 422 from service → throw RoutingError
 * - 5xx → retry up to maxRetries times
 * - timeout → throw Error (AbortController abort)
 */

import { calculateDistance, RoutingError } from "@/lib/knowledge/distances/client";

// Mock fetch globally
const originalFetch = global.fetch;

describe("calculateDistance", () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("happy path", () => {
    it("returns distance_nm and calculatorVersion on successful response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          distance_nm: 8300.5,
          route_via: "suez",
          waypoints_count: 42,
          calculator_version: "searoute-py-1.2.0",
        }),
      });

      const result = await calculateDistance({
        origin: { lat: 1.29, lon: 103.85 }, // Singapore
        dest: { lat: 51.9, lon: 4.47 }, // Rotterdam
        routeVia: "suez",
      });

      expect(result).toEqual({
        distanceNm: 8300.5,
        calculatorVersion: "searoute-py-1.2.0",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe("http://127.0.0.1:8200/distance");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body).toEqual({
        origin_lat: 1.29,
        origin_lon: 103.85,
        dest_lat: 51.9,
        dest_lon: 4.47,
        route_via: "suez",
      });
    });

    it("uses default SEAROUTE_SERVICE_URL if env not set", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          distance_nm: 100,
          calculator_version: "test",
        }),
      });

      await calculateDistance({
        origin: { lat: 0, lon: 0 },
        dest: { lat: 1, lon: 1 },
        routeVia: "direct",
      });

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:8200/);
    });
  });

  describe("error handling - 422 RoutingError", () => {
    it("throws RoutingError on 422 response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => "routing failed: no path found",
      });

      await expect(
        calculateDistance({
          origin: { lat: 0, lon: 0 },
          dest: { lat: 90, lon: 0 }, // North Pole - unreachable by sea
          routeVia: "direct",
        })
      ).rejects.toThrow(RoutingError);

      expect(global.fetch).toHaveBeenCalledTimes(1); // Should not retry on 422
    });

    it("includes error message from service", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => "routing failed: no path found",
      });

      await expect(
        calculateDistance({
          origin: { lat: 0, lon: 0 },
          dest: { lat: 90, lon: 0 },
          routeVia: "direct",
        })
      ).rejects.toThrow(/routing failed/);
    });
  });

  describe("error handling - 5xx retry", () => {
    it("retries 2x on 5xx then throws", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 502 });

      await expect(
        calculateDistance({
          origin: { lat: 0, lon: 0 },
          dest: { lat: 1, lon: 1 },
          routeVia: "direct",
        })
      ).rejects.toThrow(/searoute/); // Error message will be from last attempt

      expect(global.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it("succeeds on retry after 5xx", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ distance_nm: 100, calculator_version: "test" }),
        });

      const result = await calculateDistance({
        origin: { lat: 0, lon: 0 },
        dest: { lat: 1, lon: 1 },
        routeVia: "direct",
      });

      expect(result.distanceNm).toBe(100);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("respects custom retries option", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(
        calculateDistance(
          {
            origin: { lat: 0, lon: 0 },
            dest: { lat: 1, lon: 1 },
            routeVia: "direct",
          },
          { retries: 1 }
        )
      ).rejects.toThrow();

      expect(global.fetch).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });
  });

  describe("error handling - timeout", () => {
    it("throws on timeout via AbortController", async () => {
      (global.fetch as jest.Mock).mockImplementation(
        (_url, opts) =>
          new Promise((resolve, reject) => {
            opts.signal.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
            // Never resolve - will timeout
          })
      );

      await expect(
        calculateDistance(
          {
            origin: { lat: 0, lon: 0 },
            dest: { lat: 1, lon: 1 },
            routeVia: "direct",
          },
          { timeoutMs: 100 } // 100ms timeout
        )
      ).rejects.toThrow();
    }, 5000);

    it("respects default 15s timeout", async () => {
      // This test just verifies the timeout is set, not that it fires
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ distance_nm: 100, calculator_version: "test" }),
      });

      await calculateDistance({
        origin: { lat: 0, lon: 0 },
        dest: { lat: 1, lon: 1 },
        routeVia: "direct",
      });

      const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(opts.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("input validation", () => {
    it("rejects NaN latitude", async () => {
      await expect(
        calculateDistance({
          origin: { lat: NaN, lon: 0 },
          dest: { lat: 0, lon: 0 },
          routeVia: "direct",
        })
      ).rejects.toThrow(RangeError);
    });

    it("rejects Infinity longitude", async () => {
      await expect(
        calculateDistance({
          origin: { lat: 0, lon: Infinity },
          dest: { lat: 0, lon: 0 },
          routeVia: "direct",
        })
      ).rejects.toThrow(RangeError);
    });

    it("rejects out-of-range latitude > 90", async () => {
      await expect(
        calculateDistance({
          origin: { lat: 91, lon: 0 },
          dest: { lat: 0, lon: 0 },
          routeVia: "direct",
        })
      ).rejects.toThrow(RangeError);
    });

    it("rejects out-of-range latitude < -90", async () => {
      await expect(
        calculateDistance({
          origin: { lat: -91, lon: 0 },
          dest: { lat: 0, lon: 0 },
          routeVia: "direct",
        })
      ).rejects.toThrow(RangeError);
    });

    it("rejects out-of-range longitude > 180", async () => {
      await expect(
        calculateDistance({
          origin: { lat: 0, lon: 181 },
          dest: { lat: 0, lon: 0 },
          routeVia: "direct",
        })
      ).rejects.toThrow(RangeError);
    });

    it("rejects out-of-range longitude < -180", async () => {
      await expect(
        calculateDistance({
          origin: { lat: 0, lon: -181 },
          dest: { lat: 0, lon: 0 },
          routeVia: "direct",
        })
      ).rejects.toThrow(RangeError);
    });

    it("rejects negative timeoutMs", async () => {
      await expect(
        calculateDistance(
          {
            origin: { lat: 0, lon: 0 },
            dest: { lat: 1, lon: 1 },
            routeVia: "direct",
          },
          { timeoutMs: -1 }
        )
      ).rejects.toThrow(RangeError);
    });

    it("rejects negative retries", async () => {
      await expect(
        calculateDistance(
          {
            origin: { lat: 0, lon: 0 },
            dest: { lat: 1, lon: 1 },
            routeVia: "direct",
          },
          { retries: -1 }
        )
      ).rejects.toThrow(RangeError);
    });

    it("accepts valid boundary values", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ distance_nm: 100, calculator_version: "test" }),
      });

      await calculateDistance({
        origin: { lat: -90, lon: -180 },
        dest: { lat: 90, lon: 180 },
        routeVia: "direct",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("accepts zero retries", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(
        calculateDistance(
          {
            origin: { lat: 0, lon: 0 },
            dest: { lat: 1, lon: 1 },
            routeVia: "direct",
          },
          { retries: 0 }
        )
      ).rejects.toThrow();

      expect(global.fetch).toHaveBeenCalledTimes(1); // No retries
    });
  });
});
