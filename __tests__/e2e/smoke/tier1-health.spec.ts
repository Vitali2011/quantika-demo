import { test, expect } from '@playwright/test';

test.describe('Tier 1 — Health checks', () => {
  test('GET /api/health returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThan(0);
  });

  test('GET / loads homepage', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/Quantika/i);
  });

  test('GET /onboarding shows region picker', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByText(/Welcome to Quantika/i)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'MENA' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Med' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'WAFR' })).toBeVisible();
    await expect(page.getByRole('button', { name: /14-day trial/i })).toBeVisible();
  });

  test('WhatsApp webhook rejects invalid verify_token', async ({ request }) => {
    const res = await request.get(
      '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=test123'
    );
    expect(res.status()).toBe(403);
  });

  test('Lang/dir is en-ltr by default', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', /^en/);
    await expect(html).toHaveAttribute('dir', 'ltr');
  });

  // βf-13: guard against React #418 (hydration mismatch) regressions on
  // navigation. Server-rendered HTML must match client first-paint, otherwise
  // React throws minified error #418 in production.
  test('No React #418 hydration errors on navigation', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');

    const hydration = errors.filter(
      (e) =>
        e.includes('#418') ||
        /Hydration/.test(e) ||
        /did not match/.test(e),
    );
    expect(hydration, `Hydration errors:\n${hydration.join('\n')}`).toHaveLength(0);
  });
});
