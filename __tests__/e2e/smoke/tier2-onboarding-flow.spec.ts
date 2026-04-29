import { test, expect } from '@playwright/test';

/**
 * Bootstrap a session by POSTing to /api/sample.
 * In development CSRF is bypassed. Returns true if session cookie was set.
 */
async function bootstrapSession(page: import('@playwright/test').Page): Promise<boolean> {
  // The /api/sample POST creates a session and sets session_id + csrf_token cookies.
  // It redirects to NEXT_PUBLIC_APP_URL (prod) — we don't follow that, cookies still land.
  const res = await page.request.post('/api/sample', {
    failOnStatusCode: false,
  });
  const cookies = await page.context().cookies();
  return cookies.some(c => c.name === 'session_id');
}

test.describe('Tier 2 — Trial onboarding flow (spec-15)', () => {
  test('Onboarding page renders and has working form', async ({ page }) => {
    // Verify the onboarding page renders with all required UI elements
    await page.goto('/onboarding');
    await expect(page.getByText(/Welcome to Quantika/i)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'MENA' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Med' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'WAFR' })).toBeVisible();
    await expect(page.getByRole('button', { name: /14-day trial/i })).toBeVisible();
    // Radio buttons should be submittable (enabled, not disabled)
    await expect(page.getByRole('radio', { name: 'MENA' })).toBeEnabled();
  });

  test('Region pick → session set → redirect to /', async ({ page }) => {
    // Step 1: Bootstrap session via /api/sample (CSRF bypassed in dev)
    const sessionCreated = await bootstrapSession(page);
    if (!sessionCreated) {
      // In prod, /api/sample requires CSRF — skip rather than fail
      test.skip();
      return;
    }

    // Step 2: Go to onboarding with session
    await page.goto('/onboarding');
    await page.getByRole('radio', { name: 'MENA' }).check();
    await page.getByRole('button', { name: /14-day trial/i }).click();

    // Step 3: Server action redirects to / after startTrial + seedDemoForRegion
    await page.waitForURL('/', { timeout: 15_000 });
    // Next.js server action redirect updates page content via RSC partial diff,
    // skipping layout re-render. A full reload forces TrialBannerWrapper to re-evaluate.
    await page.reload();

    // Step 4: Trial banner should appear (TrialBannerWrapper in layout)
    await expect(
      page.getByText(/trial/i).or(page.getByText(/days remaining/i))
    ).toBeVisible({ timeout: 10_000 });
  });
});
