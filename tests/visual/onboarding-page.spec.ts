import { test, expect } from '@playwright/test';

/**
 * Visual + behavioral baseline for /onboarding (R5-medium, §5a #9).
 * Pre-loaded demo banner + Connect Gmail OAuth + mode auto-detect.
 */

test.describe('Onboarding page — layout (R5-medium)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
  });

  test('renders Welcome to Quantika heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /welcome to quantika/i })).toBeVisible();
  });

  test('Connect Gmail banner is visible', async ({ page }) => {
    await expect(page.getByText(/Connect Gmail/i).first()).toBeVisible();
  });

  test('mode auto-detect hint is visible', async ({ page }) => {
    await expect(page.getByText(/auto-detect.*role/i)).toBeVisible();
  });

  test('region radio buttons are present', async ({ page }) => {
    for (const region of ['MENA', 'Med', 'WAFR']) {
      const radio = page.locator(`input[name="region"][value="${region}"]`);
      await expect(radio).toBeAttached();
    }
  });

  test('submit button is present', async ({ page }) => {
    const btn = page.getByRole('button', { name: /start.*trial/i });
    await expect(btn).toBeVisible();
  });

  test('Connect link points to Gmail OAuth', async ({ page }) => {
    const link = page.getByRole('link', { name: /connect/i }).first();
    const href = await link.getAttribute('href');
    expect(href).toContain('/api/auth/gmail');
  });

  test('visual baseline — onboarding', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('onboarding.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });
});
