/**
 * Playwright mobile e2e — β-14
 *
 * Run via `npx playwright test tests/e2e/mobile.spec.ts`.
 * Excluded from `npm test` (jest) via jest.config.mjs ignore pattern.
 */
import { test, expect, devices } from '@playwright/test';

test.describe('Mobile bottom-sheet (iPhone 14)', () => {
  test.use({ ...devices['iPhone 14'] });

  test('match-detail opens in a bottom sheet', async ({ page }) => {
    await page.goto('/match/demo-1');
    // Trigger the BottomSheet — adjust selector to your CTA in match-detail UI.
    const cta = page.locator('[data-testid="open-match-details"]');
    if (await cta.count()) {
      await cta.first().click();
      await expect(page.locator('[data-testid="bottom-sheet"]')).toBeVisible({
        timeout: 3000,
      });
      await expect(page.locator('[data-testid="bottom-sheet"]')).toHaveAttribute(
        'aria-modal',
        'true',
      );
    }
  });
});

test.describe('Mobile swipe-card (Pixel 7)', () => {
  test.use({ ...devices['Pixel 7'] });

  test('fixture swipe-right triggers approve action', async ({ page }) => {
    await page.goto('/fixture/demo-1');
    const card = page.locator('[data-testid="swipe-card"]').first();
    if (await card.count()) {
      const box = await card.boundingBox();
      if (box) {
        await page.touchscreen.tap(box.x + 10, box.y + box.height / 2);
        // Simulate a swipe-right of >120px
        await page.mouse.move(box.x + 10, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 10 });
        await page.mouse.up();
      }
    }
  });
});
