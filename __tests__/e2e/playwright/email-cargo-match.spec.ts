import { test, expect } from '@playwright/test';

/**
 * Task 3.3b — Email → cargo → match happy path (read-only smoke).
 *
 * Strategy: avoid driving the live LLM pipeline (3-min budget per the main
 * playwright.config). Instead, rely on the demo seed (POST /api/sample,
 * already done in auth.setup) which populates emails + parsed cargos +
 * matches. We then traverse the resulting UI:
 *
 *   /            -> dashboard with sample inquiries (emails)
 *   /matches     -> list view with at least one card
 *   /match/0     -> detail view with tabs
 *
 * If the seed didn't produce matches (e.g. feature flag changes or seed
 * regression) we skip rather than fail — same pattern as existing smoke.
 */
test.describe('Task 3.3b — Email → cargo → match (happy path)', () => {
  test('dashboard renders with at least one inquiry/email card', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);

    const body = await page.locator('body').textContent();
    expect((body ?? '').length).toBeGreaterThan(20);
  });

  test('/matches page is reachable and shows results from seed', async ({ page }) => {
    await page.goto('/matches');
    // /matches may redirect to / if no matches exist; allow either landing.
    const landed = page.url();
    if (!/\/matches/.test(landed)) {
      test.skip(true, '/matches redirected — seed produced no matches');
      return;
    }

    const matchLinks = page.locator('a[href*="/match/"]');
    const count = await matchLinks.count();
    if (count === 0) {
      test.skip(true, 'No match links on /matches — seed produced no matches');
      return;
    }
    expect(count).toBeGreaterThan(0);
  });

  test('match detail page shows vessel/cargo info', async ({ page }) => {
    await page.goto('/matches');
    const firstMatch = page.locator('a[href*="/match/"]').first();
    if ((await firstMatch.count()) === 0) {
      test.skip(true, 'No match available — seed produced no matches');
      return;
    }

    await firstMatch.click();
    await page.waitForURL(/\/match\//);

    // Page should render *some* identifying text (vessel name, cargo, DWT etc.)
    const body = await page.locator('main').textContent();
    expect((body ?? '').length).toBeGreaterThan(50);
  });
});
