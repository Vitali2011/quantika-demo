import { test, expect } from '@playwright/test';

/**
 * Visual + behavioral baseline for /settings (R5-medium, §5a #12).
 * Sidebar + 10 sections + anchor URL routing.
 * Run with DEMO_AUTH_ENABLED=false (dev mode, no login required).
 */

test.describe('Settings page — layout (R5-medium)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/integrations');
    await page.waitForLoadState('networkidle');
  });

  test('redirects /settings to /settings/integrations', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/settings/integrations');
  });

  test('settings sidebar is visible', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /settings sections/i });
    await expect(nav).toBeVisible();
  });

  test('sidebar contains Integrations link', async ({ page }) => {
    const link = page.getByRole('link', { name: /integrations/i });
    await expect(link).toBeVisible();
  });

  test('sidebar contains Danger zone link', async ({ page }) => {
    const link = page.getByRole('link', { name: /danger zone/i });
    await expect(link).toBeVisible();
  });

  test('integrations section shows Connect buttons', async ({ page }) => {
    const section = page.getByTestId('settings-integrations');
    await expect(section).toBeVisible();
    const connectBtn = section.getByRole('link', { name: /connect/i }).first();
    await expect(connectBtn).toBeVisible();
  });

  test('navigates to profile section', async ({ page }) => {
    await page.getByRole('link', { name: /^profile$/i }).click();
    await page.waitForLoadState('networkidle');
    const section = page.getByTestId('settings-profile');
    await expect(section).toBeVisible();
  });

  test('navigates to danger zone section', async ({ page }) => {
    await page.getByRole('link', { name: /danger zone/i }).click();
    await page.waitForLoadState('networkidle');
    const section = page.getByTestId('settings-danger');
    await expect(section).toBeVisible();
  });

  test('desktop layout: sidebar + content visible at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/settings/integrations');
    await page.waitForLoadState('networkidle');

    const nav = page.getByRole('navigation', { name: /settings sections/i });
    const navBounds = await nav.boundingBox();
    expect(navBounds).not.toBeNull();
    if (navBounds) {
      expect(navBounds.width).toBeLessThanOrEqual(220);
    }
  });

  test('visual baseline — integrations section', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/settings/integrations');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('settings-integrations.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });
});
