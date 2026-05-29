/**
 * Tests for Sentry no-op guard behavior (spec-13).
 * Verifies Sentry.init is NOT called when DSN env vars are absent.
 *
 * sentry.client.config.ts was intentionally removed — it caused Sentry to
 * initialise twice on the client (withSentryConfig webpack injection +
 * instrumentation-client.ts Next.js hook) producing 3+ POSTs per page load.
 * instrumentation-client.ts is the single client-side init point.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const mockInit = jest.fn();

jest.mock("@sentry/nextjs", () => ({
  init: mockInit,
}));

beforeEach(() => {
  mockInit.mockClear();
  delete process.env.SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.NEXT_RUNTIME;
});

// Regression guard: sentry.client.config.ts must NOT exist — its presence
// would cause withSentryConfig to inject a second Sentry.init alongside
// instrumentation-client.ts, duplicating every client-side Sentry event.
describe("sentry.client.config — absence guard (no double-init)", () => {
  it("H1 — sentry.client.config.ts does not exist (prevents duplicate client-side Sentry.init)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path") as typeof import("path");
    const clientConfigPath = path.resolve(__dirname, "../../sentry.client.config.ts");
    const clientConfigJsPath = path.resolve(__dirname, "../../sentry.client.config.js");
    expect(fs.existsSync(clientConfigPath)).toBe(false);
    expect(fs.existsSync(clientConfigJsPath)).toBe(false);
  });
});

describe("sentry.server.config", () => {
  it("does not call Sentry.init when SENTRY_DSN is absent", () => {
    jest.isolateModules(() => {
      require("../../sentry.server.config");
      expect(mockInit).not.toHaveBeenCalled();
    });
  });

  it("calls Sentry.init when SENTRY_DSN is set", () => {
    process.env.SENTRY_DSN = "https://test@sentry.io/456";
    jest.isolateModules(() => {
      require("../../sentry.server.config");
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ dsn: "https://test@sentry.io/456" })
      );
    });
  });
});

describe("sentry.edge.config", () => {
  it("does not call Sentry.init when SENTRY_DSN is absent", () => {
    jest.isolateModules(() => {
      require("../../sentry.edge.config");
      expect(mockInit).not.toHaveBeenCalled();
    });
  });

  it("calls Sentry.init when SENTRY_DSN is set", () => {
    process.env.SENTRY_DSN = "https://test@sentry.io/789";
    jest.isolateModules(() => {
      require("../../sentry.edge.config");
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ dsn: "https://test@sentry.io/789" })
      );
    });
  });
});

describe("instrumentation register()", () => {
  it("is an async function export", () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("../../instrumentation") as {
        register: () => Promise<void>;
      };
      expect(typeof mod.register).toBe("function");
    });
  });
});

// ─── sentry-tuning: PART C prod sampling (Class 7: NODE_ENV cross-ref) ──────

describe("sentry.server.config — prod sampling (sentry-tuning PART C)", () => {
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    // @ts-expect-error - readonly in strict types but writable at runtime
    process.env.NODE_ENV = savedNodeEnv;
  });

  it("F1 — tracesSampleRate is 0.1 in production", () => {
    process.env.SENTRY_DSN = "https://test@sentry.io/456";
    // @ts-expect-error - readonly in strict types but writable at runtime
    process.env.NODE_ENV = "production";
    jest.isolateModules(() => {
      require("../../sentry.server.config");
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ tracesSampleRate: 0.1 })
      );
    });
  });

  it("F2 — tracesSampleRate is 1.0 in development (regression guard)", () => {
    process.env.SENTRY_DSN = "https://test@sentry.io/456";
    // @ts-expect-error - readonly in strict types but writable at runtime
    process.env.NODE_ENV = "development";
    jest.isolateModules(() => {
      require("../../sentry.server.config");
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ tracesSampleRate: 1.0 })
      );
    });
  });
});

describe("sentry.edge.config — prod sampling (sentry-tuning PART C)", () => {
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    // @ts-expect-error - readonly in strict types but writable at runtime
    process.env.NODE_ENV = savedNodeEnv;
  });

  it("G1 — tracesSampleRate is 0.1 in production", () => {
    process.env.SENTRY_DSN = "https://test@sentry.io/789";
    // @ts-expect-error - readonly in strict types but writable at runtime
    process.env.NODE_ENV = "production";
    jest.isolateModules(() => {
      require("../../sentry.edge.config");
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ tracesSampleRate: 0.1 })
      );
    });
  });

  it("G2 — tracesSampleRate is 1.0 in development (regression guard)", () => {
    process.env.SENTRY_DSN = "https://test@sentry.io/789";
    // @ts-expect-error - readonly in strict types but writable at runtime
    process.env.NODE_ENV = "development";
    jest.isolateModules(() => {
      require("../../sentry.edge.config");
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ tracesSampleRate: 1.0 })
      );
    });
  });
});
