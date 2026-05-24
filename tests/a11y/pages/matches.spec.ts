import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('/matches a11y — 0 wcag2a/aa violations', async ({ page }) => {
  await page.goto('/matches');
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
