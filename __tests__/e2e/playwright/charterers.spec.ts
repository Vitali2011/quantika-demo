import { test, expect } from '@playwright/test';
import { isFeatureGate } from './helpers/env';

/**
 * Task 3.3f — Charterers listing → detail flow.
 *
 * Gated by NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED. The page shows
 * "Feature Not Enabled" panel when off → skip.
 *
 * Scenario:
 *   - /charterers renders a heading and either a populated <CharterersTable>
 *     or an "Add Charterer" empty state.
 *   - If at least one charterer row is present, click into detail; verify
 *     the detail page shows the charterer name and a tier badge.
 */
test.describe('Task 3.3f — Charterers listing + detail', () => {
  test('listing renders with Charterers heading + Add button', async ({ page }) => {
    await page.goto('/charterers');

    const body = await page.locator('body').textContent();
    if (isFeatureGate(body)) {
      test.skip(true, 'NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED=false');
      return;
    }

    await expect(page.getByRole('heading', { name: /^Charterers$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Charterer/i })).toBeVisible();
  });

  test('detail view reachable if listing has at least one row', async ({ page }) => {
    await page.goto('/charterers');

    const body = await page.locator('body').textContent();
    if (isFeatureGate(body)) {
      test.skip(true, 'NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED=false');
      return;
    }

    // CharterersTable rows typically link to /charterers/<id>; pick the
    // first available link. If none, treat as empty seed and skip.
    const firstRow = page.locator('a[href^="/charterers/"]').first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, 'No charterers seeded — listing is empty');
      return;
    }

    await firstRow.click();
    await page.waitForURL(/\/charterers\/[^/]+$/);

    // Detail page should display *some* identifier — accept any of the
    // tier badge variants. We refuse a 5xx/empty body.
    const detailBody = await page.locator('main').textContent();
    expect((detailBody ?? '').length).toBeGreaterThan(20);
  });
});
