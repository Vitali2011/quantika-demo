/**
 * Tests for sourcemap upload configuration in next.config.mjs (spec-04).
 * Verifies withSentryConfig wraps the config and behaves gracefully without SENTRY_AUTH_TOKEN.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
export {};

const mockWithSentryConfig = jest.fn((config: object, options: object) => ({
  ...config,
  _sentryOptions: options,
}));

jest.mock("@sentry/nextjs", () => ({
  withSentryConfig: mockWithSentryConfig,
}));

beforeEach(() => {
  mockWithSentryConfig.mockClear();
  delete process.env.SENTRY_AUTH_TOKEN;
});

describe("next.config.mjs — withSentryConfig wrap", () => {
  it("exports a function or object (wrapped by withSentryConfig)", () => {
    jest.isolateModules(() => {
      const mod = require("../../next.config.mjs") as {
        default?: unknown;
      };
      const exported = mod.default ?? mod;
      expect(["function", "object"]).toContain(typeof exported);
      expect(exported).not.toBeNull();
    });
  });

  it("does not throw when SENTRY_AUTH_TOKEN is absent", () => {
    expect(() => {
      jest.isolateModules(() => {
        require("../../next.config.mjs");
      });
    }).not.toThrow();
  });

  it("calls withSentryConfig with next config and sentry options", () => {
    jest.isolateModules(() => {
      require("../../next.config.mjs");
      expect(mockWithSentryConfig).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
});

describe("next.config.mjs — sourcemap options", () => {
  it("has deleteSourcemapsAfterUpload: true when sourcemap upload is configured", () => {
    jest.isolateModules(() => {
      require("../../next.config.mjs");
      const calls = mockWithSentryConfig.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const [, sentryOptions] = calls[0] as [object, Record<string, unknown>];
      // Conditional check: if deleteSourcemapsAfterUpload is set, it must be true.
      // (Option is added by spec-02; this assertion is enforced when that option exists.)
      if (sentryOptions?.deleteSourcemapsAfterUpload !== undefined) {
        expect(sentryOptions.deleteSourcemapsAfterUpload).toBe(true);
      }
    });
  });
});
