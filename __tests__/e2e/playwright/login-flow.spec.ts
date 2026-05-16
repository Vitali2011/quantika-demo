import { test, expect } from '@playwright/test';
import { SUITE_ENV } from './helpers/env';

// Login-flow test runs without the pre-seeded storage state so the form
// behaviour is observable as a brand-new visitor.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Task 3.3a — Login flow', () => {
  test('renders /login form with password field + submit button', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: /Quantika Demo/i })).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible();
  });

  test('wrong password → redirect to /login?error=1 with error banner', async ({ page }) => {
    await page.goto('/login');

    await page.locator('input[name="password"]').fill('definitely-wrong-password');
    await page.getByRole('button', { name: /Sign in/i }).click();

    await expect(page).toHaveURL(/\/login\?error=1/);
    // Next.js injects an empty <div role="alert" id="__next-route-announcer__">
    // on every page; narrow to the visible banner inside the form card.
    await expect(
      page.locator('div[role="alert"]').filter({ hasText: /invalid credentials/i }),
    ).toBeVisible();
  });

  test('correct password → redirect to "/" and demo dashboard is reachable', async ({ page }) => {
    if (!SUITE_ENV.demoAuthPassword) {
      test.skip(true, 'DEMO_AUTH_PASSWORD not set — cannot exercise successful login');
      return;
    }

    await page.goto('/login');
    await page.locator('input[name="password"]').fill(SUITE_ENV.demoAuthPassword);
    await page.getByRole('button', { name: /Sign in/i }).click();

    // POST /api/auth/login responds 303 → "/". The browser follows the redirect.
    await page.waitForURL('**/');
    expect(page.url()).not.toContain('/login');

    // Sanity-check the landing page renders something (not a 5xx body).
    const bodyText = await page.locator('body').textContent();
    expect((bodyText ?? '').length).toBeGreaterThan(10);
  });

  test('logout (POST /api/auth/logout) redirects back to /login', async ({ page, request }) => {
    // Drive logout via the same route used by the UI; it 303-redirects to /login.
    const res = await request.post('/api/auth/logout', {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect([302, 303]).toContain(res.status());
    expect(res.headers().location ?? '').toMatch(/\/login/);

    // And the page-level navigation confirms /login is reachable post-logout.
    await page.goto('/login');
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });
});
