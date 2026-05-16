import { test as setup, expect } from '@playwright/test';
import { SUITE_ENV } from './helpers/env';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_STATE = path.join('playwright', '.auth', 'user.json');

/**
 * One-time auth bootstrap. Two modes:
 *
 * 1. DEMO_AUTH_ENABLED=true in the running env → POST /api/auth/login with
 *    real credentials, persist cookies via storageState. Subsequent tests
 *    reuse the cookie and skip the login flow.
 *
 * 2. DEMO_AUTH_ENABLED is false/unset (default local) → no cookie needed;
 *    we still bootstrap the demo session by calling /api/sample (mirrors
 *    the smoke pattern) so that downstream pages have seed data.
 *
 * Either way we write a storageState file so the chromium project can mount
 * it unconditionally without an `if` in every spec.
 */
setup('authenticate and seed demo session', async ({ page }) => {
  setup.setTimeout(120_000); // first request can hit a cold Next.js dev compile
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });

  const authEnabled = process.env.DEMO_AUTH_ENABLED === 'true';

  // Step 1: log in only when auth is actually enforced. When DEMO_AUTH_ENABLED
  // is false (default local dev), the middleware bypasses the cookie check
  // and a POST would just waste a slow first-request budget.
  if (authEnabled && SUITE_ENV.demoAuthPassword) {
    const res = await page.request.post('/api/auth/login', {
      form: { user: SUITE_ENV.demoAuthUser, password: SUITE_ENV.demoAuthPassword },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect([200, 302, 303]).toContain(res.status());
  }

  // Step 2: seed the demo session. /api/sample is idempotent on the demo
  // environment and sets session_id cookie + populates inquiries/emails.
  await page.goto('/');
  const seedRes = await page.request.post('/api/sample', { failOnStatusCode: false });
  // If /api/sample isn't available (e.g. seed flag off in prod), don't block
  // — individual tests will skip on missing data.
  if (![200, 201, 204].includes(seedRes.status())) {
     
    console.warn(`[auth.setup] /api/sample returned ${seedRes.status()}; tests may skip on missing data`);
  }

  await page.context().storageState({ path: STORAGE_STATE });
});
