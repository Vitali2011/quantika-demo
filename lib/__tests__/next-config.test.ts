/**
 * Smoke tests for next.config.mjs — withSentryConfig wrapping (spec-02).
 * Verifies config exports a valid object/function and does not throw
 * when Sentry env vars are absent.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
export {};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockWithSentryConfig = jest.fn((config: unknown, _opts: unknown) => config);

jest.mock("@sentry/nextjs", () => ({
  withSentryConfig: mockWithSentryConfig,
}));

beforeEach(() => {
  mockWithSentryConfig.mockClear();
  delete process.env.SENTRY_AUTH_TOKEN;
  delete process.env.SENTRY_DSN;
  delete process.env.SENTRY_ORG;
  delete process.env.SENTRY_PROJECT;
});

describe("next.config.mjs", () => {
  it("exports non-null config when all Sentry env vars are absent", () => {
    jest.isolateModules(() => {
      const mod = require("../../next.config.mjs") as { default: unknown };
      expect(mod.default).not.toBeNull();
      expect(["function", "object"]).toContain(typeof mod.default);
    });
  });

  it("passes correct sentryOptions shape to withSentryConfig", () => {
    process.env.SENTRY_ORG = "test-org";
    process.env.SENTRY_PROJECT = "test-proj";
    jest.isolateModules(() => {
      require("../../next.config.mjs");
      expect(mockWithSentryConfig).toHaveBeenCalledWith(
        expect.objectContaining({ rewrites: expect.any(Function) }),
        expect.objectContaining({
          org: "test-org",
          project: "test-proj",
          sourcemaps: expect.objectContaining({ deleteSourcemapsAfterUpload: true }),
        })
      );
    });
  });

  it("sets silent=true when SENTRY_DSN is absent", () => {
    jest.isolateModules(() => {
      require("../../next.config.mjs");
      const opts = mockWithSentryConfig.mock.calls[0][1] as Record<string, unknown>;
      expect(opts.silent).toBe(true);
    });
  });

  it("sets silent=false when SENTRY_DSN is present", () => {
    process.env.SENTRY_DSN = "https://test@sentry.io/123";
    jest.isolateModules(() => {
      require("../../next.config.mjs");
      const opts = mockWithSentryConfig.mock.calls[0][1] as Record<string, unknown>;
      expect(opts.silent).toBe(false);
    });
  });
});
