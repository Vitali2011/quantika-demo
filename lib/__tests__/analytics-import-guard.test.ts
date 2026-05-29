/**
 * BUG-5 (LOW) — analytics.track() / initAnalytics() use `await import('posthog-js')`.
 * Four callers fire these un-awaited, so a failed dynamic import (network/bundle
 * error) floats an UNHANDLED PROMISE REJECTION. The functions must swallow load/init
 * failures internally so they always resolve, never reject into an un-awaited caller.
 *
 * Here `import('posthog-js')` is mocked to FAIL. track()/initAnalytics() must still
 * resolve (undefined) without throwing — proving an un-awaited caller can't float a
 * rejection. We keep the deferred-bundle win (still a dynamic import, no static one).
 */
jest.mock('posthog-js', () => {
  throw new Error('simulated posthog-js load failure');
});

describe('analytics — dynamic import failure must not reject (BUG-5)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NEXT_PUBLIC_POSTHOG_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('track() resolves (no unhandled rejection) when posthog-js fails to load', async () => {
    const { track } = await import('../analytics');
    await expect(track('evt', { a: 1 })).resolves.toBeUndefined();
  });

  it('initAnalytics() resolves when posthog-js fails to load', async () => {
    const { initAnalytics } = await import('../analytics');
    await expect(initAnalytics()).resolves.toBeUndefined();
  });
});
