/**
 * Tests for Sentry no-op guard behavior (spec-13).
 * Verifies Sentry.init is NOT called when DSN env vars are absent.
 */

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

describe("sentry.client.config", () => {
  it("does not call Sentry.init when NEXT_PUBLIC_SENTRY_DSN is absent", () => {
    jest.isolateModules(() => {
      require("../../sentry.client.config");
      expect(mockInit).not.toHaveBeenCalled();
    });
  });

  it("calls Sentry.init when NEXT_PUBLIC_SENTRY_DSN is set", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://test@sentry.io/123";
    jest.isolateModules(() => {
      require("../../sentry.client.config");
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ dsn: "https://test@sentry.io/123" })
      );
    });
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
