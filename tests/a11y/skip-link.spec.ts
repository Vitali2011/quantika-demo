import { test, expect } from '@playwright/test';

test('skip-to-content link is present and functional on /dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  const skipLink = page.locator('a[href="#main-content"]');
  await expect(skipLink).toBeAttached();

  // Focus via keyboard — Tab from body
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();

  // main-content landmark must exist
  const main = page.locator('#main-content');
  await expect(main).toBeAttached();
});
