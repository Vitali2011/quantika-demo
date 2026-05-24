import { test, expect } from '@playwright/test';

test('⌘K opens palette', async ({ page }) => {
  await page.goto('/matches');
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('HelpFAB visible on /matches', async ({ page }) => {
  await page.goto('/matches');
  await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
});

test('AIBar clickable opens palette', async ({ page }) => {
  await page.goto('/matches');
  await page.getByRole('button', { name: /open ai assistant/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
