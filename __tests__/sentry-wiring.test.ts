/**
 * Acceptance tests for Sentry wiring — Phase 2a (RED state).
 *
 * Contract:
 *  - Sentry.init is a no-op (NOT called) when the relevant DSN env var is falsy.
 *  - Sentry.init IS called with correct options when the DSN env var is set.
 *  - app/global-error.tsx calls Sentry.captureException(error) via useEffect.
 *  - app/error.tsx renders without crashing (smoke test).
 *
 * NOTE: @testing-library/react is NOT available in this environment and
 * testEnvironment is 'node' — component rendering tests (global-error, error)
 * are limited to import/smoke verification. See test_assumptions.md.
 */

// ─── Module-level side-effect test helpers ─────────────────────────────────

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  // Restore a clean env copy before each test
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

// ─── A. instrumentation-client.ts DSN guard ─────────────────────────────────

describe("instrumentation-client.ts — NEXT_PUBLIC_SENTRY_DSN guard", () => {
  it("A1 — Class 1: does NOT call Sentry.init when NEXT_PUBLIC_SENTRY_DSN is undefined", async () => {
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({
      init: mockInit,
      captureException: jest.fn(),
    }));

    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    await import("../instrumentation-client");

    expect(mockInit).not.toHaveBeenCalled();
  });

  it("A2 — Class 1 edge: does NOT call Sentry.init when NEXT_PUBLIC_SENTRY_DSN is empty string", async () => {
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({
      init: mockInit,
      captureException: jest.fn(),
    }));

    process.env.NEXT_PUBLIC_SENTRY_DSN = "";
    await import("../instrumentation-client");

    expect(mockInit).not.toHaveBeenCalled();
  });

  it("A3 — happy path: calls Sentry.init with { dsn, tracesSampleRate: 1.0 } when NEXT_PUBLIC_SENTRY_DSN is set", async () => {
    const DSN = "https://testkey@sentry.io/123";
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({
      init: mockInit,
      captureRouterTransitionStart: jest.fn(),
      replayIntegration: jest.fn(() => ({ name: "Replay" })),
      captureException: jest.fn(),
    }));

    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN;
    await import("../instrumentation-client");

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        tracesSampleRate: 1.0,
      })
    );
  });
});

// ─── B. sentry.server.config.ts DSN guard ───────────────────────────────────

describe("sentry.server.config.ts — SENTRY_DSN guard", () => {
  it("B1 — Class 7 (Config): uses SENTRY_DSN (not NEXT_PUBLIC_SENTRY_DSN)", async () => {
    // This test verifies the contract that the server config reads the correct
    // env var key. We set NEXT_PUBLIC_SENTRY_DSN but leave SENTRY_DSN unset.
    // Sentry.init must NOT be called.
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({
      init: mockInit,
      captureException: jest.fn(),
    }));

    delete process.env.SENTRY_DSN;
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://should-be-ignored@sentry.io/999";
    await import("../sentry.server.config");

    expect(mockInit).not.toHaveBeenCalled();
  });

  it("B2 — Class 1: does NOT call Sentry.init when SENTRY_DSN is undefined", async () => {
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({
      init: mockInit,
      captureException: jest.fn(),
    }));

    delete process.env.SENTRY_DSN;
    await import("../sentry.server.config");

    expect(mockInit).not.toHaveBeenCalled();
  });

  it("B3 — happy path: calls Sentry.init when SENTRY_DSN is set", async () => {
    const DSN = "https://serverkey@sentry.io/456";
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({
      init: mockInit,
      captureException: jest.fn(),
    }));

    process.env.SENTRY_DSN = DSN;
    await import("../sentry.server.config");

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
      })
    );
  });
});

// ─── C. app/global-error.tsx — captureException via useEffect ───────────────
//
// NOTE: @testing-library/react is NOT available in this environment.
// testEnvironment is 'node'. Full component rendering cannot be performed here.
// These tests verify structural/import contracts only.
// Assumption: impl agent must manually verify the useEffect+captureException
// wiring via a jsdom environment or manual browser testing.

describe("app/global-error.tsx — structural contract (no jsdom)", () => {
  it("C1 — module exports a default function (component)", async () => {
    // Mock @sentry/nextjs to prevent side effects
    jest.doMock("@sentry/nextjs", () => ({
      init: jest.fn(),
      captureException: jest.fn(),
    }));
    // Mock react to prevent DOM-related errors in node env
    jest.doMock("react", () => ({
      ...jest.requireActual("react"),
      useEffect: jest.fn((fn: () => void) => fn()),
    }));

    const mod = await import("../app/global-error");
    expect(typeof mod.default).toBe("function");
  });

  it("C2 — captureException is called when global-error component renders with an error", async () => {
    const mockCaptureException = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({
      init: jest.fn(),
      captureException: mockCaptureException,
    }));

    const testError = new Error("boom");
    let effectCallback: (() => void) | undefined;

    jest.doMock("react", () => ({
      ...jest.requireActual("react"),
      useEffect: jest.fn((fn: () => void) => {
        effectCallback = fn;
      }),
    }));

    const mod = await import("../app/global-error");
    // Invoke component to trigger useEffect registration
    mod.default({ error: testError, reset: jest.fn() });

    // Simulate the effect running (as React would do after render)
    if (effectCallback) {
      effectCallback();
    }

    expect(mockCaptureException).toHaveBeenCalledWith(testError);
  });
});

// ─── D. app/error.tsx — smoke test ──────────────────────────────────────────

describe("app/error.tsx — structural contract (no jsdom)", () => {
  it("D1 — module exports a default function (component)", async () => {
    jest.doMock("@sentry/nextjs", () => ({
      init: jest.fn(),
      captureException: jest.fn(),
    }));

    const mod = await import("../app/error");
    expect(typeof mod.default).toBe("function");
  });

  it("D2 — component accepts error and reset props without throwing", async () => {
    jest.doMock("@sentry/nextjs", () => ({
      init: jest.fn(),
      captureException: jest.fn(),
    }));
    jest.doMock("react", () => ({
      ...jest.requireActual("react"),
      useEffect: jest.fn(),
    }));

    const mod = await import("../app/error");
    const resetFn = jest.fn();
    const testError = new Error("page error");

    // Calling the component as a function should not throw
    expect(() => mod.default({ error: testError, reset: resetFn })).not.toThrow();
  });
});

// ─── E. instrumentation-client.ts — sentry-tuning features ─────────────────

const sentryTuningMock = () => ({
  init: jest.fn(),
  captureRouterTransitionStart: jest.fn(),
  replayIntegration: jest.fn(() => ({ name: "Replay" })),
  captureException: jest.fn(),
});

describe("instrumentation-client.ts — sentry-tuning (onRouterTransitionStart + Replay + prod sampling)", () => {
  it("E1 — onRouterTransitionStart is exported as a function", async () => {
    jest.doMock("@sentry/nextjs", sentryTuningMock);

    const mod = await import("../instrumentation-client") as { onRouterTransitionStart?: unknown };
    expect(typeof mod.onRouterTransitionStart).toBe("function");
  });

  it("E2 — tracesSampleRate is 1.0 in non-production (regression guard)", async () => {
    const DSN = "https://testkey@sentry.io/123";
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({ ...sentryTuningMock(), init: mockInit }));

    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN;
    // NODE_ENV is 'test' in this environment — not production
    await import("../instrumentation-client");

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 1.0 })
    );
  });

  it("E3 — tracesSampleRate is 0.1 in production (Class 7: NODE_ENV config cross-ref)", async () => {
    const DSN = "https://testkey@sentry.io/123";
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({ ...sentryTuningMock(), init: mockInit }));

    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN;
    // @ts-expect-error - readonly in strict types but writable at runtime
    process.env.NODE_ENV = "production";
    await import("../instrumentation-client");

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.1 })
    );
  });

  it("E4 — integrations array contains replayIntegration result", async () => {
    const DSN = "https://testkey@sentry.io/123";
    const mockInit = jest.fn();
    const replayInstance = { name: "Replay" };
    jest.doMock("@sentry/nextjs", () => ({
      ...sentryTuningMock(),
      init: mockInit,
      replayIntegration: jest.fn(() => replayInstance),
    }));

    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN;
    await import("../instrumentation-client");

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: expect.arrayContaining([replayInstance]),
      })
    );
  });

  it("E5 — replaysSessionSampleRate is 0 in non-production (Class 7)", async () => {
    const DSN = "https://testkey@sentry.io/123";
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({ ...sentryTuningMock(), init: mockInit }));

    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN;
    await import("../instrumentation-client");

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ replaysSessionSampleRate: 0 })
    );
  });

  it("E6 — replaysSessionSampleRate is 0.1 and replaysOnErrorSampleRate is 1.0 in production (Class 7)", async () => {
    const DSN = "https://testkey@sentry.io/123";
    const mockInit = jest.fn();
    jest.doMock("@sentry/nextjs", () => ({ ...sentryTuningMock(), init: mockInit }));

    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN;
    // @ts-expect-error - readonly in strict types but writable at runtime
    process.env.NODE_ENV = "production";
    await import("../instrumentation-client");

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      })
    );
  });
});
