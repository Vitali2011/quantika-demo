import { test, expect } from '@playwright/test';

/**
 * Regression guard for #452 — /vessels page crash.
 * React error #31: object {open,close,display} rendered as React child
 * React error #419: hydration mismatch
 */
test.describe('/vessels page — regression #452', () => {
  test('page loads without React error #31 or hydration errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`${err.message}\n${err.stack ?? ''}`);
    });

    await page.goto('/vessels', { waitUntil: 'networkidle', timeout: 20_000 });
    await page.waitForTimeout(1_500);

    const reactObjectErrors = consoleErrors.filter((e) =>
      /Minified React error #31/i.test(e) ||
      /Objects are not valid as a React child/i.test(e) ||
      /Minified React error #418/i.test(e) ||
      /Hydration failed/i.test(e) ||
      /Text content does not match/i.test(e),
    );

    expect(
      reactObjectErrors,
      `Got ${reactObjectErrors.length} React error(s): ${reactObjectErrors.slice(0, 2).join('; ')}`,
    ).toEqual([]);
  });

  test('page renders vessels heading and table', async ({ page }) => {
    await page.goto('/vessels', { waitUntil: 'networkidle', timeout: 20_000 });

    await expect(page.getByRole('heading', { name: /^Vessels$/ })).toBeVisible();
    await expect(page.locator('[data-testid="vessels-table-card"]')).toBeVisible();
  });
});
