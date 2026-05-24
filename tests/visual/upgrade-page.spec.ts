import { test, expect } from '@playwright/test';

/**
 * Visual + behavioral baseline for /upgrade (R5-medium, §5a #10).
 * Usage-aware: current plan + usage bars + contextual upgrade prompt.
 * Classic 3-tier pricing cards.
 */

test.describe('Upgrade page — layout (R5-medium)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/upgrade');
    await page.waitForLoadState('networkidle');
  });

  test('renders Upgrade Your Quantika Plan heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /upgrade your quantika plan/i })).toBeVisible();
  });

  test('renders all three tier cards', async ({ page }) => {
    for (const name of ['Free', 'Pro', 'Enterprise']) {
      await expect(page.getByText(new RegExp(`^${name}$`, 'i')).first()).toBeVisible();
    }
  });

  test('Upgrade to Pro CTA links to billing checkout', async ({ page }) => {
    const link = page.getByRole('link', { name: /upgrade to pro/i });
    const href = await link.getAttribute('href');
    expect(href).toContain('/billing/checkout');
  });

  test('Contact sales CTA links to mailto', async ({ page }) => {
    const link = page.getByRole('link', { name: /contact sales/i });
    const href = await link.getAttribute('href');
    expect(href).toBe('mailto:sales@quantika.org');
  });

  test('tier grid is responsive (3-column on sm)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/upgrade');
    await page.waitForLoadState('networkidle');
    const grid = page.locator('.sm\\:grid-cols-3');
    await expect(grid).toBeAttached();
  });

  test('trust quote is visible', async ({ page }) => {
    const quote = page.getByText(/fixture review time/i);
    await expect(quote).toBeVisible();
  });

  test('visual baseline — upgrade page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/upgrade');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('upgrade-page.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });
});
