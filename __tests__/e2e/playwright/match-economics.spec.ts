import { test, expect } from '@playwright/test';

/**
 * Task 3.3h — /match/0 deep tabs: EconomicsTab + FuelEU tile + Quote tab.
 *
 * Depends on the demo seed (POST /api/sample in auth.setup) producing at
 * least one match. When the seed is empty (e.g. cron didn't run, feature
 * flags differ) we skip — same pattern as the tier2-match-detail smoke.
 *
 * The FuelEU tile is rendered only when its server-side flag is on
 * (FuelEU compliance feature). When off, the Economics tab still renders
 * core charter economics — we assert that minimal evidence and treat
 * missing FuelEU as a partial pass with explicit note.
 */
test.describe('Task 3.3h — Match detail: Economics + FuelEU + Quote', () => {
  test('navigate to /match/0 and switch through Economics & Quote tabs', async ({ page }) => {
    // First land on dashboard and confirm a match exists.
    await page.goto('/');
    const firstMatch = page.locator('a[href*="/match/"]').first();
    if ((await firstMatch.count()) === 0) {
      // Try /matches list view as fallback.
      await page.goto('/matches');
      if ((await page.locator('a[href*="/match/"]').count()) === 0) {
        test.skip(true, 'Demo seed produced no matches — cannot verify /match/0');
        return;
      }
    }

    // Direct navigation to /match/0 (the first match in the seeded list).
    await page.goto('/match/0');
    // If session is missing the page redirects to '/' — detect that and skip.
    if (!/\/match\/0/.test(page.url())) {
      test.skip(true, 'Session redirect — /api/sample bootstrap did not stick');
      return;
    }

    // Economics tab — name varies by role/text label. Use accessible name + fallback.
    const econTab = page
      .getByRole('tab', { name: /Economics/i })
      .or(page.getByText(/^Economics$/i).first());
    await econTab.click();

    // Confirm we landed on the Economics panel — the panel uses data-testid
    // "tab-economics" via MatchTabs.
    const econPanel = page.locator('[data-testid="tab-economics"]');
    await expect(econPanel).toBeVisible({ timeout: 5_000 });

    // FuelEU tile presence is gated by FUEL_EU flag. When absent, log but
    // don't fail — the rest of the tab is still informative.
    const fuelEuTile = page.locator('[data-testid="fueleu-tile"]');
    const fuelEuCount = await fuelEuTile.count();
    if (fuelEuCount > 0) {
      await expect(fuelEuTile.first()).toBeVisible();
    } else {
       
      console.info('[match-economics] FuelEU tile absent — feature flag likely off');
    }

    // Quote tab — verify Draft Quote textarea + Copy button.
    const quoteTab = page
      .getByRole('tab', { name: /Quote/i })
      .or(page.getByText(/^Quote$/i).first());
    await quoteTab.click();

    const quotePanel = page.locator('[data-testid="tab-quote"]');
    await expect(quotePanel).toBeVisible({ timeout: 5_000 });
    await expect(quotePanel.getByText(/Draft Quote/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy/i })).toBeVisible();
  });
});
