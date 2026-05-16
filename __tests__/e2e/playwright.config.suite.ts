import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'node:path';

// Load .env.local so DEMO_AUTH_PASSWORD and NEXT_PUBLIC_*_ENABLED reach the
// test process (Next.js' dev server loads it on its own; the Playwright
// runner is a separate Node process and would otherwise see neither).
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

/**
 * Config for the Task 3.3 Playwright suite (8 feature E2E tests).
 *
 * Strategy:
 * - Uses `npm run dev` (fast, no production build) — same pattern as smoke config.
 * - One-time `auth.setup.ts` project performs API login and saves storageState.
 * - All feature tests depend on the setup project and reuse the cookie.
 * - Feature flags (NEXT_PUBLIC_*_ENABLED) come from .env.local; tests use
 *   test.skip() gracefully when a feature is not enabled in the running env.
 *
 * Run locally:  `npm run test:suite`  (added to package.json)
 * Override base URL:  `SUITE_BASE_URL=https://demo.quantika.org npm run test:suite`
 */

const BASE_URL = process.env.SUITE_BASE_URL || 'http://localhost:3000';
const STORAGE_STATE = 'playwright/.auth/user.json';

export default defineConfig({
  testDir: './playwright',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-suite', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testDir: './playwright',
      testMatch: /auth\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testDir: './playwright',
      testMatch: /.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.SUITE_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
