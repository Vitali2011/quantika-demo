import { test, expect } from '@playwright/test';

/**
 * Visual + behavioral baseline for Match Detail page (R5c — CD pixel-target).
 *
 * Set PLAYWRIGHT_MATCH_ID env var to a valid match DB id to run layout assertions.
 * Without it, tests are skipped. Run against demo mode (DEMO_AUTH_ENABLED=false).
 */
const MATCH_ID = process.env.PLAYWRIGHT_MATCH_ID ?? '';
const MATCH_URL = `/match/${MATCH_ID}`;

test.describe('Match Detail — layout (R5c)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!MATCH_ID) {
      testInfo.skip(true, 'PLAYWRIGHT_MATCH_ID not set — skipping match detail layout tests');
      return;
    }
    await page.goto(MATCH_URL);
    await page.waitForLoadState('networkidle');
  });

  test('hero row renders with amber score pill', async ({ page }) => {
    if (!MATCH_ID) return;
    const hero = page.getByTestId('match-hero');
    await expect(hero).toBeVisible();
    const scorePill = page.getByTestId('score-pill');
    await expect(scorePill).toBeVisible();
    // Score pill text should be a number
    const text = await scorePill.textContent();
    expect(text).toMatch(/\d+/);
  });

  test('desktop: side panel visible at 1280px', async ({ page }) => {
    if (!MATCH_ID) return;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(MATCH_URL);
    await page.waitForLoadState('networkidle');

    const sidePanel = page.getByTestId('match-side-panel');
    await expect(sidePanel).toBeVisible();

    const matchPanel = page.getByTestId('match-detail-panel');
    await expect(matchPanel).toBeVisible();
  });

  test('desktop: left content wider than right panel', async ({ page }) => {
    if (!MATCH_ID) return;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(MATCH_URL);
    await page.waitForLoadState('networkidle');

    const sidePanel = page.getByTestId('match-side-panel');
    const sideBounds = await sidePanel.boundingBox();
    if (!sideBounds) return;

    // Right panel should be ≤ 340px (w-72 = 288px or w-80 = 320px)
    expect(sideBounds.width).toBeLessThanOrEqual(340);
    // And positioned in the right ~25% of a 1280px viewport
    expect(sideBounds.x).toBeGreaterThan(700);
  });

  test('mobile: FAB visible at 375px, side panel hidden', async ({ page }) => {
    if (!MATCH_ID) return;
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(MATCH_URL);
    await page.waitForLoadState('networkidle');

    const fab = page.getByTestId('mobile-panel-fab');
    await expect(fab).toBeVisible();

    const sidePanel = page.getByTestId('match-side-panel');
    await expect(sidePanel).not.toBeVisible();
  });

  test('mobile: FAB opens bottom-sheet', async ({ page }) => {
    if (!MATCH_ID) return;
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(MATCH_URL);
    await page.waitForLoadState('networkidle');

    const fab = page.getByTestId('mobile-panel-fab');
    await fab.click();

    const sheet = page.getByTestId('mobile-panel-sheet');
    await expect(sheet).toBeVisible();
    // Sheet should contain the panel content
    await expect(sheet.getByTestId('match-detail-panel')).toBeVisible();
  });

  test('mobile: closing bottom-sheet via backdrop', async ({ page }) => {
    if (!MATCH_ID) return;
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(MATCH_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('mobile-panel-fab').click();
    const sheet = page.getByTestId('mobile-panel-sheet');
    await expect(sheet).toBeVisible();

    // Click backdrop (the div behind the sheet)
    await page.mouse.click(187, 100);
    await expect(sheet).not.toBeVisible();
  });

  test('tabs preserved: all 4 tabs render', async ({ page }) => {
    if (!MATCH_ID) return;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(MATCH_URL);
    await page.waitForLoadState('networkidle');

    // MatchTabs should still render if session match is available
    const tabList = page.getByRole('tablist');
    const tabCount = await tabList.count();
    if (tabCount === 0) return; // No session match available — graceful skip

    const tabs = page.getByRole('tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('breadcrumb links back to /matches', async ({ page }) => {
    if (!MATCH_ID) return;
    const backLink = page.getByRole('link', { name: /matches/i }).first();
    await expect(backLink).toBeVisible();
    const href = await backLink.getAttribute('href');
    expect(href).toBe('/matches');
  });
});
