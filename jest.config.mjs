import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  // Exclude worktree dirs only when running from the main repo (not from within a worktree).
  // Covers both `.wave/` (wave-pipeline) and `.claude/worktrees/` (dev-pipeline / manual).
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/e2e/',
    '/tests/regression/',
    // β-14 Playwright specs (run via `npm run test:e2e`, not jest)
    '/tests/e2e/mobile\\.spec\\.ts$',
    '/tests/e2e/kpi-timeout\\.spec\\.ts$',
    // R1 visual regression specs (run via playwright, not jest)
    '/tests/visual/',
    // R6 a11y specs (run via playwright.a11y.config.ts, not jest)
    '/tests/a11y/',
    ...(process.cwd().includes('/.wave/') ? [] : ['/.wave/']),
    ...(process.cwd().includes('/.claude/worktrees/') ? [] : ['/\\.claude/worktrees/']),
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        moduleResolution: 'node',
      },
    }],
  },
  moduleNameMapper: {
    // p-limit is ESM-only; use a CJS shim in test environments
    '^p-limit$': '<rootDir>/__mocks__/p-limit.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default createJestConfig(config);
