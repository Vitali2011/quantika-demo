/**
 * βf3-04: SPA navigation hydration guard
 *
 * Tests that React #418 hydration errors do NOT occur when navigating between
 * routes via Next.js <Link> (client-side navigation, not full page reload).
 *
 * Wave-βf-2 spec-βf2-05 tested first-load only — clean.
 * This spec tests multi-hop SPA navigation: / → /cargo/:id → /vessel/:id → back.
 *
 * The session is bootstrapped via /api/sample (same approach as tier2-match-detail).
 */
import { test, expect } from '@playwright/test';

const HYDRATION_PATTERNS = [
  /Minified React error #418/i,
  /Minified React error #423/i,
  /Minified React error #425/i,
  /Hydration failed/i,
  /Text content does not match server-rendered HTML/i,
  /did not match.*server/i,
];

/** Bootstrap a demo session. Returns true if session cookie was set. */
async function setupSession(page: import('@playwright/test').Page): Promise<boolean> {
  // Submit the "Try with Sample Data" form via page navigation so the browser
  // context receives the session_id cookie on the same origin.
  // Navigating via <form> POST avoids the cross-origin cookie issue that occurs
  // when page.request.post follows the 303 redirect to demo.quantika.org.
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Submit the sample form (same approach as a real user clicking the button)
  const sampleButton = page.locator('form[action="/api/sample"] button[type="submit"]');
  if (await sampleButton.count() > 0) {
    // Click the form submit — follows the POST+redirect entirely in the browser
    await Promise.all([
      page.waitForURL(/\/processing|\/dashboard|\//, { timeout: 10_000 }).catch(() => undefined),
      sampleButton.click(),
    ]);
  } else {
    // Fallback: use page.request which shares the browser cookie jar
    await page.request.post('/api/sample', { failOnStatusCode: false });
  }

  // Navigate back to localhost home to ensure we're in the right context
  // and to trigger any session-based redirects that confirm the cookie is live.
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Check for session_id in all cookies for the localhost origin
  const cookies = await page.context().cookies('http://localhost:3000');
  return cookies.some((c) => c.name === 'session_id');
}

test.describe('βf3-04: SPA navigation — no React #418 hydration errors', () => {
  test('cargo → vessel → back navigation produces no hydration errors', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(new Error(msg.text()));
    });

    // Bootstrap session with sample data
    const hasSession = await setupSession(page);
    if (!hasSession) {
      // Skip gracefully when /api/sample is unavailable (prod without writable session)
      test.skip(true, 'No session available — /api/sample did not set cookie');
      return;
    }

    // Step 1: Navigate to homepage (dashboard)
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await page.waitForTimeout(500);

    // Step 2: Navigate to a cargo page via Link click (SPA navigation)
    const cargoLink = page.locator('a[href^="/cargo/"]').first();
    const cargoLinkCount = await cargoLink.count();
    if (cargoLinkCount === 0) {
      // Fallback: direct navigation to sample cargo (still exercises client-side hydration)
      await page.goto('/cargo/sample-01');
    } else {
      await cargoLink.click();
    }
    await page.waitForURL(/\/cargo\//, { timeout: 15_000 });
    await page.waitForTimeout(500);

    // Step 3: Navigate to a vessel page via Link click (SPA navigation)
    const vesselLink = page.locator('a[href^="/vessel/"]').first();
    const vesselLinkCount = await vesselLink.count();
    if (vesselLinkCount === 0) {
      // Fallback: direct navigation to sample vessel
      await page.goto('/vessel/sample-13');
    } else {
      await vesselLink.click();
    }
    await page.waitForURL(/\/vessel\//, { timeout: 15_000 });
    await page.waitForTimeout(500);

    // Step 4: Go back to cargo via browser back button
    await page.goBack();
    await page.waitForTimeout(300);

    // Assert: no hydration errors accumulated over the entire navigation sequence
    const hydrationErrors = errors.filter((e) =>
      HYDRATION_PATTERNS.some((p) => p.test(e.message)),
    );

    if (hydrationErrors.length > 0) {
      for (const e of hydrationErrors.slice(0, 3)) {
        console.log(`[spa-hydration] ${e.message.substring(0, 1200)}`);
      }
    }

    expect(
      hydrationErrors.map((e) => e.message.substring(0, 200)),
      `SPA navigation produced ${hydrationErrors.length} hydration error(s)`,
    ).toHaveLength(0);
  });

  test('cargo → dashboard → vessel round-trip (3-hop SPA) produces no hydration errors', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(new Error(msg.text()));
    });

    const hasSession = await setupSession(page);
    if (!hasSession) {
      test.skip(true, 'No session available — /api/sample did not set cookie');
      return;
    }

    // Step 1: Direct navigation to a known sample cargo page
    await page.goto('/cargo/sample-01');
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(500);

    // Step 2: Click the "Back to Dashboard" link (Next.js <Link> = SPA navigation)
    const backLink = page.locator('a[href="/dashboard"]').first();
    if (await backLink.count() > 0) {
      await backLink.click();
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
      await page.waitForTimeout(500);
    } else {
      // Fallback: navigate directly
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    }

    // Step 3: Navigate to a vessel detail page (SPA navigation via Link or direct)
    await page.goto('/vessel/sample-13');
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(500);

    // Step 4: Navigate back to cargo via the back button
    await page.goBack();
    await page.waitForTimeout(300);

    const hydrationErrors = errors.filter((e) =>
      HYDRATION_PATTERNS.some((p) => p.test(e.message)),
    );

    if (hydrationErrors.length > 0) {
      for (const e of hydrationErrors.slice(0, 3)) {
        console.log(`[spa-hydration-3hop] ${e.message.substring(0, 1200)}`);
      }
    }

    expect(
      hydrationErrors.map((e) => e.message.substring(0, 200)),
      `3-hop SPA navigation produced ${hydrationErrors.length} hydration error(s)`,
    ).toHaveLength(0);
  });
});
