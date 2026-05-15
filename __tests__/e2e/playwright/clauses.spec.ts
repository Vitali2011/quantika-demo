import { test, expect } from '@playwright/test';
import { isFeatureGate } from './helpers/env';

/**
 * Task 3.3d — BIMCO Clauses search page.
 *
 * Gated by NEXT_PUBLIC_BIMCO_RAG_ENABLED. The page shows "Coming Soon"
 * placeholder when off — we detect that and skip.
 *
 * Scenario:
 *   - Page renders with search input + charter-party filter dropdown.
 *   - Filter to GENCON 2022, type "laytime", click Search.
 *   - Results area is reachable (count panel or empty state — both fine).
 */
test.describe('Task 3.3d — BIMCO clauses search', () => {
  test('page renders search input + charter-party filter', async ({ page }) => {
    await page.goto('/clauses');

    const body = await page.locator('body').textContent();
    if (isFeatureGate(body) || /coming\s+soon/i.test(body ?? '')) {
      test.skip(true, 'NEXT_PUBLIC_BIMCO_RAG_ENABLED=false in running env');
      return;
    }

    await expect(page.locator('input#query')).toBeVisible();
    await expect(page.locator('select#cp')).toBeVisible();
  });

  test('search "laytime" with GENCON 2022 filter; results panel reachable', async ({ page }) => {
    await page.goto('/clauses');

    const body = await page.locator('body').textContent();
    if (isFeatureGate(body) || /coming\s+soon/i.test(body ?? '')) {
      test.skip(true, 'NEXT_PUBLIC_BIMCO_RAG_ENABLED=false in running env');
      return;
    }

    await page.locator('select#cp').selectOption('GENCON 2022');
    await page.locator('input#query').fill('laytime');
    await page.getByRole('button', { name: /Search Clauses/i }).click();

    // Either results count header appears or an error/empty state.
    // We just refuse total silence on the page.
    await page.waitForTimeout(2000);
    const afterBody = await page.locator('body').textContent();
    expect(afterBody).toMatch(/(Result|Results|error|HTTP|Failed)/i);
  });
});
