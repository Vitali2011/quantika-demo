/**
 * Playwright e2e — β-14 KPI 5s timeout fallback.
 *
 * Closes Wave-α E2E finding "Market KPIs Loading forever":
 * KPI cards must NEVER show a spinner past 5s. After 5s of slow / hung
 * fetches they MUST display the Unavailable state.
 *
 * Run via `npx playwright test tests/e2e/kpi-timeout.spec.ts`.
 */
import { test, expect } from '@playwright/test';

test('KPI never spins more than 5 seconds (mocked slow API)', async ({ page }) => {
  // Simulate a 10s hang on the market benchmark endpoint.
  await page.route('**/api/market/benchmark**', async (route) => {
    await new Promise((r) => setTimeout(r, 10_000));
    await route.fulfill({ status: 200, body: JSON.stringify({}) });
  });

  await page.goto('/dashboard');

  // At t=5500ms the spinner must be gone and the Unavailable card must be shown.
  await page.waitForTimeout(5500);

  const spinners = page.locator('[data-testid="kpi-spinner"]');
  await expect(spinners).toHaveCount(0);

  const unavailable = page.locator('[data-testid="kpi-unavailable"]');
  await expect(unavailable.first()).toBeVisible();
});

test('KPI Unavailable card has a Retry button when url is provided', async ({ page }) => {
  await page.route('**/api/market/benchmark**', async (route) => {
    await route.fulfill({ status: 503, body: 'service unavailable' });
  });

  await page.goto('/dashboard');
  const retry = page.locator('[data-testid="kpi-retry"]');
  await expect(retry.first()).toBeVisible({ timeout: 6000 });
});
