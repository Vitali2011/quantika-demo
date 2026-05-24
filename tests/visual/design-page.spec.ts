import { test, expect } from '@playwright/test';

test.describe('/design — visual regression', () => {
  test('full page screenshot', async ({ page }) => {
    await page.goto('/design');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('design-full.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('buttons section', async ({ page }) => {
    await page.goto('/design');
    const buttons = page.locator('section[aria-labelledby="t-buttons"]');
    await expect(buttons).toHaveScreenshot('buttons.png', { maxDiffPixelRatio: 0.02 });
  });

  test('tokens swatches', async ({ page }) => {
    await page.goto('/design');
    const tokens = page.locator('section[aria-labelledby="t-tokens"]');
    await expect(tokens).toHaveScreenshot('tokens.png', { maxDiffPixelRatio: 0.02 });
  });
});
