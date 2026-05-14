import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './__tests__/e2e',
  timeout: 180000, // 3 minutes — LLM pipeline is slow
  expect: {
    timeout: 30000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    // Default: local dev server. Override via PLAYWRIGHT_BASE_URL for prod smoke runs.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  // webServer: start a local Next.js build before running E2E tests.
  // In CI (process.env.CI=true), reuseExistingServer=false so a fresh build is always used.
  // Locally, reuseExistingServer=true means you can run `npm run dev` beforehand and skip rebuild.
  // Only active when not pointing at a remote server via PLAYWRIGHT_BASE_URL.
  ...(!process.env.PLAYWRIGHT_BASE_URL && {
    webServer: {
      command: 'npm run build && npm run start',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  }),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'test-results',
});
