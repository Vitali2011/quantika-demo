import { test, expect } from '@playwright/test';

/**
 * Visual + behavioral baseline for /email inbox (R5-medium, §5a #8).
 * Stream of action-cards + Accept/Edit/Reject + 📄 Original.
 */

test.describe('Email inbox page — layout (R5-medium)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/email');
    await page.waitForLoadState('networkidle');
  });

  test('page renders Email Inbox heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /email inbox/i })).toBeVisible();
  });

  test('Upload link is present', async ({ page }) => {
    const link = page.getByRole('link', { name: /upload/i });
    await expect(link).toBeVisible();
  });

  test('action buttons visible on email cards', async ({ page }) => {
    const acceptBtns = page.getByRole('button', { name: /accept/i });
    const count = await acceptBtns.count();
    if (count > 0) {
      await expect(acceptBtns.first()).toBeVisible();
      await expect(page.getByRole('button', { name: /edit/i }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /reject/i }).first()).toBeVisible();
    } else {
      // Empty state — no emails
      await expect(page.getByText(/no emails yet/i)).toBeVisible();
    }
  });

  test('Original link navigates to email detail', async ({ page }) => {
    const origLinks = page.getByRole('link', { name: /original/i });
    const count = await origLinks.count();
    if (count > 0) {
      const href = await origLinks.first().getAttribute('href');
      expect(href).toMatch(/^\/email\//);
    }
  });

  test('visual baseline — email inbox', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/email');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('email-inbox.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });
});
