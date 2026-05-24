import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// /design is a public bypass path — accessible without auth and shows AppShell
// when DEMO_AUTH_ENABLED=false (demo mode, always authenticated).
// For authenticated environments, use PLAYWRIGHT_AUTH_COOKIE env var.
const PAGE = process.env.PLAYWRIGHT_APPSHELL_PAGE ?? '/design';

test.describe('AppShell visual + a11y', () => {
  test('desktop layout: TopNav visible at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PAGE);
    await page.waitForLoadState('networkidle');
    // TopNav has sticky position and is hidden on mobile via md:hidden
    const header = page.locator('header').first();
    await expect(header).toBeVisible();
    await expect(page).toHaveScreenshot('app-shell-desktop.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('mobile: BottomNav visible at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(PAGE);
    await page.waitForLoadState('networkidle');
    // BottomNav has md:hidden = visible on mobile
    const bottomNav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(bottomNav).toBeVisible();
    await expect(page).toHaveScreenshot('app-shell-mobile.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('mode toggle swaps Cargo↔Vessels nav order', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`${PAGE}?mode=charterer`);
    await page.waitForLoadState('networkidle');
    const navLinks1 = await page.locator('nav[aria-label="Primary navigation"] > a').allTextContents();
    expect(navLinks1).toEqual(['Dashboard', 'Matches', 'Cargo', 'Vessels', 'Market']);

    await page.goto(`${PAGE}?mode=owner`);
    await page.waitForLoadState('networkidle');
    const navLinks2 = await page.locator('nav[aria-label="Primary navigation"] > a').allTextContents();
    expect(navLinks2).toEqual(['Dashboard', 'Matches', 'Vessels', 'Cargo', 'Market']);
  });

  test('a11y — 0 WCAG2 violations on shell', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PAGE);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
