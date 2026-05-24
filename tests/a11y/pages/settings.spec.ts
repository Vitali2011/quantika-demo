import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('/settings a11y — 0 wcag2a/aa violations', async ({ page }) => {
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test('/settings/profile a11y — 0 wcag2a/aa violations', async ({ page }) => {
  await page.goto('/settings/profile');
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test('/settings/notifications a11y — 0 wcag2a/aa violations', async ({ page }) => {
  await page.goto('/settings/notifications');
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
