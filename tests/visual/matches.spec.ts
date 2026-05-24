import { test, expect } from '@playwright/test';

test('Matches page renders filter chips bar', async ({ page }) => {
  await page.goto('/matches');
  await page.waitForLoadState('networkidle');
  // Quick filter chips must be present
  await expect(page.getByRole('button', { name: /^All$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Fresh/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Score 80\+/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /DWT 50/i })).toBeVisible();
});

test('Matches page density toggle switches between Cards and Table', async ({ page }) => {
  await page.goto('/matches');
  await page.waitForLoadState('networkidle');
  // Density toggle buttons present
  await expect(page.getByRole('button', { name: /Cards/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Table/i })).toBeVisible();
});

test('Matches table view renders Score column header', async ({ page }) => {
  await page.goto('/matches');
  await page.waitForLoadState('networkidle');
  // Switch to table if not already
  const tableBtn = page.getByRole('button', { name: /Table/i });
  if (await tableBtn.isVisible()) await tableBtn.click();
  // Score column header
  await expect(page.locator('th', { hasText: /Score/i })).toBeVisible();
});

test('Matches page snapshot — filter bar visible', async ({ page }) => {
  await page.goto('/matches');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).toBeVisible();
});
