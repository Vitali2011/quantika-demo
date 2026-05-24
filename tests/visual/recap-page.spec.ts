import { test, expect } from '@playwright/test';

/**
 * Visual + behavioral baseline for /recap (R5-medium, §5a #7).
 * Form-first + AI assist + Sources panel.
 */

test.describe('Recap index page — layout (R5-medium)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/recap');
    await page.waitForLoadState('networkidle');
  });

  test('page renders recap heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /negotiation recap/i })).toBeVisible();
  });

  test('AI Assist card is visible', async ({ page }) => {
    const card = page.getByText(/AI Assist/i).first();
    await expect(card).toBeVisible();
  });

  test('Sources panel is visible', async ({ page }) => {
    const sourcesHeading = page.getByText(/Sources/i).first();
    await expect(sourcesHeading).toBeVisible();
  });

  test('Generate recap button is present', async ({ page }) => {
    const btn = page.getByRole('button', { name: /generate recap/i });
    await expect(btn).toBeVisible();
  });

  test('Fields card shows expected field labels', async ({ page }) => {
    for (const label of ['Cargo', 'Load port', 'Disch port', 'Laycan']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test('desktop layout: two-column at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recap');
    await page.waitForLoadState('networkidle');

    const aiAssist = page.getByText(/AI Assist/).first();
    const sources = page.getByText(/Sources/).first();
    const aiBox = await aiAssist.boundingBox();
    const srcBox = await sources.boundingBox();

    if (aiBox && srcBox) {
      expect(srcBox.x).toBeGreaterThan(aiBox.x + aiBox.width);
    }
  });

  test('visual baseline — recap index', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recap');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('recap-index.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });
});
