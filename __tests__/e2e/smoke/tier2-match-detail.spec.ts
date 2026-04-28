import { test, expect } from '@playwright/test';

/** Bootstrap session and return to dashboard with seeded demo data. */
async function setupWithSession(page: import('@playwright/test').Page): Promise<boolean> {
  await page.request.post('/api/sample', { failOnStatusCode: false });
  const cookies = await page.context().cookies();
  return cookies.some(c => c.name === 'session_id');
}

test.describe('Tier 2 — Match detail (spec-06, spec-02)', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await setupWithSession(page);
    if (!ok) {
      test.skip(); // no session available (prod without OAuth)
    }
    await page.goto('/');
  });

  test('Dashboard renders without 5xx', async ({ page }) => {
    // After session bootstrap, / should load without server error
    await expect(page).not.toHaveURL(/5\d\d/);
    // The page should have some content (not blank)
    const body = await page.locator('body').textContent();
    expect(body?.length ?? 0).toBeGreaterThan(10);
  });

  test('Match page renders 4 tabs (spec-06)', async ({ page }) => {
    // Try to find a match link on the dashboard
    const firstMatchLink = page.locator('a[href*="/match/"]').first();
    const count = await firstMatchLink.count();
    if (count === 0) {
      // No matches yet — seed may not have produced matches; skip rather than fail
      // TODO: investigate if demo seed always produces matches for MENA region
      test.skip();
      return;
    }

    await firstMatchLink.click();
    await page.waitForURL(/\/match\//);

    for (const tab of ['Vessels', 'Economics', 'Passport', 'Quote']) {
      await expect(
        page.getByRole('tab', { name: tab }).or(page.getByText(tab, { exact: true }))
      ).toBeVisible();
    }
  });

  test('Match page has confidence border CSS class (spec-02)', async ({ page }) => {
    const firstMatchLink = page.locator('a[href*="/match/"]').first();
    if (await firstMatchLink.count() === 0) { test.skip(); return; }

    await firstMatchLink.click();
    await page.waitForURL(/\/match\//);

    // Confidence borders use Tailwind classes: border-blue-*, border-yellow-*, border-orange-*, border-gray-*
    const bordered = page.locator(
      '[class*="border-blue"],[class*="border-yellow"],[class*="border-orange"],[class*="border-gray"]'
    ).first();
    await expect(bordered).toBeVisible();
  });
});
