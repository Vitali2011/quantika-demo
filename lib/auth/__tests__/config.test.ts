/**
 * Tests for lib/auth/config.ts
 * Reading DEMO_AUTH_* env vars with defaults and validation.
 */

describe('lib/auth/config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    // Clear all DEMO_AUTH vars
    delete process.env.DEMO_AUTH_ENABLED;
    delete process.env.DEMO_AUTH_USER;
    delete process.env.DEMO_AUTH_PASSWORD;
    delete process.env.DEMO_AUTH_SECRET;
    delete process.env.DEMO_AUTH_COOKIE_DAYS;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  async function getConfig() {
    const mod = await import('../config');
    return mod.getAuthConfig();
  }

  it('returns defaults when no env vars set', async () => {
    const config = await getConfig();
    expect(config.enabled).toBe(false);
    expect(config.user).toBe('admin');
    expect(config.cookieDays).toBe(7);
  });

  it('reads DEMO_AUTH_ENABLED=true', async () => {
    process.env.DEMO_AUTH_ENABLED = 'true';
    process.env.DEMO_AUTH_SECRET = 'a-secret-that-is-long-enough-abc';
    process.env.DEMO_AUTH_PASSWORD = 'pass';
    const config = await getConfig();
    expect(config.enabled).toBe(true);
  });

  it('reads custom user and password', async () => {
    process.env.DEMO_AUTH_USER = 'vitali';
    process.env.DEMO_AUTH_PASSWORD = 'mypassword';
    const config = await getConfig();
    expect(config.user).toBe('vitali');
    expect(config.password).toBe('mypassword');
  });

  it('reads DEMO_AUTH_COOKIE_DAYS', async () => {
    process.env.DEMO_AUTH_COOKIE_DAYS = '30';
    const config = await getConfig();
    expect(config.cookieDays).toBe(30);
  });

  it('exposes secret from DEMO_AUTH_SECRET', async () => {
    process.env.DEMO_AUTH_SECRET = 'super-secret-key';
    const config = await getConfig();
    expect(config.secret).toBe('super-secret-key');
  });

  it('returns null secret when DEMO_AUTH_SECRET not set', async () => {
    const config = await getConfig();
    expect(config.secret).toBeNull();
  });

  it('cookieDays falls back to 7 for invalid number', async () => {
    process.env.DEMO_AUTH_COOKIE_DAYS = 'not-a-number';
    const config = await getConfig();
    expect(config.cookieDays).toBe(7);
  });
});
