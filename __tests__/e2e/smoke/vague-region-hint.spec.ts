/**
 * Playwright smoke — vague-region hint (Phase E3)
 *
 * Verifies:
 *  1. When a match has vagueRegionAdjustment < 0 in reason_structured,
 *     the hint text appears on the /matches page.
 *  2. When vagueRegionAdjustment = 0, no hint is shown.
 *
 * Run via: npx playwright test __tests__/e2e/smoke/vague-region-hint.spec.ts
 */
import { test, expect } from '@playwright/test';

/** Bootstrap a session via /api/sample and return whether session cookie was set. */
async function bootstrapSession(page: import('@playwright/test').Page): Promise<boolean> {
  await page.request.post('/api/sample', { failOnStatusCode: false });
  const cookies = await page.context().cookies();
  return cookies.some((c) => c.name === 'session_id');
}

/** Seed a match record via POST /api/matches (requires active session cookie). */
async function seedMatch(
  page: import('@playwright/test').Page,
  reasonStructured: object | null,
): Promise<number | null> {
  const body: Record<string, unknown> = {
    cargo_id: `smoke-cargo-vague-${Date.now()}`,
    vessel_id: `smoke-vessel-vague-${Date.now()}`,
    score: 42,
    reason: 'Smoke test match',
    status: 'shortlist',
  };
  if (reasonStructured !== null) {
    body.reason_structured = JSON.stringify(reasonStructured);
  }

  const res = await page.request.post('/api/matches', {
    data: body,
    failOnStatusCode: false,
  });

  if (res.status() !== 201) return null;
  const data = await res.json();
  return typeof data.id === 'number' ? data.id : null;
}

test.describe('Vague-region hint on /matches (Phase E3)', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await bootstrapSession(page);
    if (!ok) {
      test.skip();
    }
  });

  test('hint visible when vagueRegionAdjustment < 0', async ({ page }) => {
    // Seed a match with vagueRegionAdjustment = -20 (vessel-side vague)
    const breakdown = {
      components: [
        {
          label: 'Geographic proximity',
          points: 2,
          max: 20,
          reason: 'vessel position vague (East Med) — cannot estimate proximity precisely',
        },
      ],
      basePhysical: 42,
      readinessAdjustment: 0,
      sanctionsAdjustment: 0,
      vagueRegionAdjustment: -20,
      finalScore: 42,
    };

    const id = await seedMatch(page, breakdown);
    if (id === null) {
      // /api/matches may be disabled (MATCHES_ENABLED != 'true') — skip gracefully
      test.skip();
      return;
    }

    await page.goto('/matches');
    // Wait for the page to settle
    await page.waitForLoadState('networkidle');

    // The hint should appear for the seeded match
    const hint = page.locator('text=/[Vv]essel position vague|[Vv]ague.*anchorage/').first();
    await expect(hint).toBeVisible({ timeout: 10000 });
  });

  test('hint NOT visible when vagueRegionAdjustment = 0', async ({ page }) => {
    // Seed a match with vagueRegionAdjustment = 0 (no penalty)
    const breakdown = {
      components: [
        {
          label: 'Geographic proximity',
          points: 10,
          max: 20,
          reason: 'distance ~200 nm',
        },
      ],
      basePhysical: 65,
      readinessAdjustment: 0,
      sanctionsAdjustment: 0,
      vagueRegionAdjustment: 0,
      finalScore: 65,
    };

    const id = await seedMatch(page, breakdown);
    if (id === null) {
      test.skip();
      return;
    }

    await page.goto('/matches');
    await page.waitForLoadState('networkidle');

    // No vague-region hint should appear for this match
    const hint = page.locator('text=/[Vv]ague.*anchorage|[Vv]ague.*load port/');
    // Either no element or hidden — count should be 0
    await expect(hint).toHaveCount(0);
  });
});
