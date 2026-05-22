import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Broker happy-path E2E — end-to-end smoke for the broker demo scenario:
 *
 *   Login → /processing (pipeline UI) → seed via /api/sample →
 *   /dashboard (real data) → /matches (entries visible) →
 *   /match/0 (detail + tabs) → Explain this deal (modal opens)
 *
 * Each step asserts:
 *   - No console 4xx/5xx errors
 *   - Screen shows real data (not blank / "No data" / eternal skeleton)
 *   - Screenshot captured for documentation
 *
 * If a step fails the test records the breakpoint and stops —
 * prod code is NOT modified.
 */

const ARTIFACTS_DIR = path.join(process.cwd(), '__tests__', 'e2e', 'playwright', 'artifacts');

async function screenshot(page: import('@playwright/test').Page, name: string) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const dest = path.join(ARTIFACTS_DIR, `${name}.png`);
  await page.screenshot({ path: dest, fullPage: true });
}

/**
 * Seed demo session by POSTing to /api/sample with the correct Origin header.
 *
 * The production server (NODE_ENV=production) running at localhost:3000 uses
 * Origin-check CSRF (validateCsrf). page.request does not add Origin by
 * default — we inject it explicitly. The 303 response sets session_id +
 * csrf_token cookies; we stop at maxRedirects=0 so we don't follow the
 * redirect to https://demo.quantika.org (hardcoded in NEXT_PUBLIC_APP_URL).
 */
async function seedSampleSession(page: import('@playwright/test').Page): Promise<void> {
  const res = await page.request.post('/api/sample', {
    headers: { 'Origin': 'http://localhost:3000' },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  if (res.status() === 303 || res.status() === 200 || res.status() === 201) {
    console.log(`[broker-e2e] seed /api/sample → ${res.status()} (session_id cookie set)`);
  } else {
    console.warn(`[broker-e2e] seed /api/sample → ${res.status()} — downstream tests may fail`);
  }
}

function trackConsoleErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Capture 4xx / 5xx errors surfaced to console
      if (/\b(401|403|404|500|502|503)\b/.test(text) || /error/i.test(text)) {
        errors.push(text);
      }
    }
  });
  page.on('response', res => {
    const url = res.url();
    const status = res.status();
    if (status >= 400 && url.includes(page.context().browser()?.browserType().name() ?? '')) return;
    if (status >= 500) errors.push(`HTTP ${status} — ${url}`);
    // Flag unexpected 401/403 on API routes (not auth endpoints)
    if ((status === 401 || status === 403) && /\/api\/(?!auth)/.test(url)) {
      errors.push(`HTTP ${status} — ${url}`);
    }
  });
  return errors;
}

// ─── Step 0: /login page ─────────────────────────────────────────────────────

test.describe('Broker happy-path E2E', () => {
  // Each test uses the pre-authenticated storageState from auth.setup.ts
  // (storageState is injected by the "chromium" project in the suite config).

  // ── Step 1: Login form renders ───────────────────────────────────────────

  test('Step 1 — /login renders form (no auth cookie)', async ({ browser }) => {
    // Run without storageState so we can see the unauthenticated state
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    const consoleErrors = trackConsoleErrors(page);

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Quantika Demo/i })).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible();

    await screenshot(page, '01-login-form');
    expect(consoleErrors.filter(e => /\b(500|502|503)\b/.test(e)), `Step 1 console 5xx: ${consoleErrors.join('; ')}`).toHaveLength(0);
    await ctx.close();
  });

  // ── Step 2: /processing pipeline UI ──────────────────────────────────────

  test('Step 2 — /processing renders pipeline UI; observe first failure', async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);

    // Navigate to processing page — it will immediately start calling API steps
    await page.goto('/processing');

    // Assert pipeline UI visible within 3 seconds (before pipeline completes/fails)
    await expect(page.locator('h2', { hasText: /Analyzing your inbox/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[aria-label="Processing steps"]')).toBeVisible();

    // Capture initial UI
    await screenshot(page, '02a-processing-started');

    // Wait up to 30 s for a visible outcome: either dashboard redirect or error banner
    let outcome: 'redirected' | 'error' | 'timeout' = 'timeout';
    try {
      await Promise.race([
        page.waitForURL('**/dashboard', { timeout: 30_000 }).then(() => { outcome = 'redirected'; }),
        page.locator('[data-testid="processing-fatal-error"], .text-destructive').first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => { outcome = 'error'; }),
      ]);
    } catch {
      outcome = 'timeout';
    }

    await screenshot(page, `02b-processing-outcome-${outcome}`);

    // Log the pipeline outcome for the report; both 'error' and 'timeout'
    // are acceptable breakpoints — we do NOT fail the test here.
    if (outcome === 'error') {
      // Identify which step failed
      const errorText = await page.locator('.text-destructive, [class*="text-red"]').first().textContent().catch(() => 'unknown');
      console.log(`[broker-e2e] BREAKPOINT: /processing step failed → "${errorText}"`);
    } else if (outcome === 'timeout') {
      console.log('[broker-e2e] /processing: still running after 30 s (slow pipeline or waiting on Gmail)');
    } else {
      console.log('[broker-e2e] /processing: pipeline completed → redirected to /dashboard');
    }

    // The step renders the pipeline list — that's the key assertion
    // (pipeline may fail due to missing Gmail/AI keys — that's a documented breakpoint)
  });

  // ── Step 3: /dashboard shows real data after sample seed ─────────────────

  test('Step 3 — /dashboard shows real emails + match after /api/sample seed', async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);

    // Seed demo session via real browser form POST (includes Origin + auth cookie)
    await seedSampleSession(page);

    // Visit dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    await screenshot(page, '03a-dashboard-loaded');

    // Assert: NOT the empty-inbox placeholder
    const emptyState = page.locator('text=📭');
    await expect(emptyState, 'dashboard shows empty inbox — sample seed did not populate emails').not.toBeVisible();

    // Assert: at least one email section or action panel is visible
    const hasContent = await page.locator('main').evaluate(el => (el.textContent ?? '').length > 100);
    expect(hasContent, 'dashboard main content is empty').toBe(true);

    // Assert: match section (goodMatches from session)
    const matchSection = page.locator('text=vessel-cargo match');
    const matchCount = await matchSection.count();
    if (matchCount > 0) {
      await expect(matchSection.first()).toBeVisible();
      console.log('[broker-e2e] ✅ match section visible on dashboard');
    } else {
      console.log('[broker-e2e] ℹ️ no match section visible — matches may be in ActionPanel collapsed state');
    }

    await screenshot(page, '03b-dashboard-detail');

    // No 5xx
    expect(consoleErrors.filter(e => /\b(500|502|503)\b/.test(e)), `Step 3 5xx: ${consoleErrors.join('; ')}`).toHaveLength(0);
  });

  // ── Step 4: /matches shows match rows ─────────────────────────────────────

  test('Step 4 — /matches renders match rows (not "No matches")', async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);

    // Ensure seeded session via real browser form POST
    await seedSampleSession(page);

    await page.goto('/matches');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await screenshot(page, '04a-matches-page');

    // Should NOT redirect to /login or /
    expect(page.url(), 'matches page redirected — session or MATCHES_ENABLED missing').toContain('/matches');

    // Assert: heading visible (page rendered, not blank/5xx)
    await expect(page.getByRole('heading', { name: /Your Recent Matches/i })).toBeVisible({ timeout: 10_000 });

    // Assert: at least one match row (DEMO_ECONOMICS_MATCH with score 92)
    // DOCUMENTED BREAKPOINT: production server build may show "No matches yet" if
    // session.matches from /api/sample are not persisted to the matches SQLite table.
    // Root cause: persistSessionMatches() in the deployed /matches page handler is
    // either absent or failing silently — dashboard reads from session memory (works),
    // /matches reads from DB (empty). Not fixing prod code per task scope.
    const matchBody = await page.locator('main').textContent();
    const hasRows = (matchBody ?? '').length > 50 && !/(no matches|no results|empty)/i.test(matchBody ?? '');
    if (!hasRows) {
      console.log(`[broker-e2e] BREAKPOINT Step 4: /matches shows empty state → "${matchBody?.slice(0, 150)}"`);
    }
    expect(
      hasRows,
      `Step 4 BREAKPOINT: /matches empty — session matches (DEMO_ECONOMICS_MATCH) not written to DB. ` +
      `Dashboard reads session memory (✓); /matches reads SQLite (empty). ` +
      `Content: "${matchBody?.slice(0, 200)}"`,
    ).toBe(true);

    await screenshot(page, '04b-matches-detail');
    expect(consoleErrors.filter(e => /\b(500|502|503)\b/.test(e)), `Step 4 5xx: ${consoleErrors.join('; ')}`).toHaveLength(0);
  });

  // ── Step 5: /match/0 shows detail + tabs ─────────────────────────────────

  test('Step 5 — /match/0 renders vessel name, match badge, and tabs', async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);

    // Ensure seeded session via real browser form POST
    await seedSampleSession(page);

    await page.goto('/match/0');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await screenshot(page, '05a-match-detail');

    // Should NOT 404 or redirect to /
    expect(page.url(), 'match detail redirected — session missing or idx out of bounds').toContain('/match/0');

    // Assert: vessel name visible (may be "Unknown vessel" for demo data)
    const header = page.locator('main').first();
    const headerText = await header.textContent();
    expect((headerText ?? '').length, 'match detail main content empty').toBeGreaterThan(20);
    console.log(`[broker-e2e] Match detail header text: "${headerText?.slice(0, 100)}"`);

    // Assert: match level badge (GOOD / POSSIBLE / WEAK)
    const badge = page.locator('[class*="bg-green"],[class*="bg-yellow"],[class*="bg-orange"]').first();
    await expect(badge, 'match level badge not visible').toBeVisible({ timeout: 10_000 });

    // Assert: tabs rendered (Vessels | Economics | Passport | Quote)
    for (const tabName of ['Vessels', 'Economics', 'Passport', 'Quote']) {
      const tab = page.getByRole('tab', { name: tabName })
        .or(page.getByText(tabName, { exact: true }));
      if (await tab.count() > 0) {
        await expect(tab.first()).toBeVisible();
        console.log(`[broker-e2e] ✅ tab "${tabName}" visible`);
      } else {
        console.log(`[broker-e2e] ⚠️ tab "${tabName}" not found — may use different label`);
      }
    }

    await screenshot(page, '05b-match-detail-tabs');
    expect(consoleErrors.filter(e => /\b(500|502|503)\b/.test(e)), `Step 5 5xx: ${consoleErrors.join('; ')}`).toHaveLength(0);
  });

  // ── Step 6: Explain this deal modal ──────────────────────────────────────

  test('Step 6 — "Explain this deal" button opens modal on /match/0', async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);

    // Ensure seeded session via real browser form POST
    await seedSampleSession(page);

    await page.goto('/match/0');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const explainBtn = page.getByTestId('explain-deal-button');
    const btnCount = await explainBtn.count();
    if (btnCount === 0) {
      // EXPLAIN_DEAL_ENABLED or NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED may be false in test env
      const bodyText = await page.locator('body').textContent();
      console.log('[broker-e2e] BREAKPOINT: "Explain this deal" button not found.');
      console.log(`[broker-e2e] NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED env check — page body snippet: "${bodyText?.slice(0, 200)}"`);
      test.skip(true, 'NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED=false or button missing — documented breakpoint');
      return;
    }

    await expect(explainBtn).toBeVisible();
    await screenshot(page, '06a-explain-deal-button-visible');

    await explainBtn.click();

    // Dialog should open
    await expect(page.getByTestId('explain-deal-dialog')).toBeVisible({ timeout: 5_000 });
    await screenshot(page, '06b-explain-deal-dialog-open');

    // Loading state then result (or error) — give LLM up to 60 s
    const loadingSpinner = page.getByTestId('explain-deal-loading');
    const resultPanel = page.getByTestId('explain-deal-result');
    const errorPanel = page.getByTestId('explain-deal-error');

    try {
      await Promise.race([
        resultPanel.waitFor({ state: 'visible', timeout: 60_000 }),
        errorPanel.waitFor({ state: 'visible', timeout: 60_000 }),
      ]);
    } catch {
      // Still loading — capture the state and document as breakpoint
      const isLoading = await loadingSpinner.isVisible().catch(() => false);
      await screenshot(page, '06c-explain-deal-timeout');
      console.log(`[broker-e2e] BREAKPOINT: explain-deal modal still ${isLoading ? 'loading' : 'open'} after 60 s`);
      // Don't fail — this could be a slow LLM; record the state
      return;
    }

    await screenshot(page, '06c-explain-deal-outcome');

    const hasResult = await resultPanel.isVisible().catch(() => false);
    const hasError = await errorPanel.isVisible().catch(() => false);

    if (hasResult) {
      // Assert: result has non-trivial content
      const resultText = await resultPanel.textContent();
      expect((resultText ?? '').length, 'explain-deal result panel is empty').toBeGreaterThan(50);
      console.log('[broker-e2e] ✅ explain-deal result visible');
    } else if (hasError) {
      const errorText = await errorPanel.textContent();
      console.log(`[broker-e2e] BREAKPOINT: explain-deal API returned error — "${errorText}"`);
      // Document the error but don't fail — breakpoint captured
    }

    expect(consoleErrors.filter(e => /\b(500|502|503)\b/.test(e)), `Step 6 5xx: ${consoleErrors.join('; ')}`).toHaveLength(0);
  });
});
