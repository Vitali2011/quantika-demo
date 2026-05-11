/**
 * Playwright config — RAG Visual E2E Verification
 *
 * Headed mode with slowMo so you can watch the browser live.
 * Screenshots captured on every test step.
 *
 * Run:
 *   E2E_BASE_URL=http://localhost:3000 \
 *   E2E_ADMIN_TOKEN=your_token \
 *   npx playwright test \
 *     --config=__tests__/e2e/playwright.config.rag-visual.ts \
 *     --project=chromium --reporter=html
 *
 * After run: npx playwright show-report
 */
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './',
  testMatch: ['**/rag-visual-verification.spec.ts'],
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-rag', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: false,
    launchOptions: { slowMo: 1200 },
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'on',
    viewport: { width: 1400, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
