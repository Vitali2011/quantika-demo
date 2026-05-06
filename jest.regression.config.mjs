/**
 * Minimal jest config for regression tests.
 * Bypasses next/jest.js (removed in next@16) — uses ts-jest directly.
 * Only runs files under tests/regression/.
 */

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/regression/**/*.test.ts', '<rootDir>/tests/regression/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        moduleResolution: 'node',
      },
    }],
  },
  moduleNameMapper: {
    '^p-limit$': '<rootDir>/__mocks__/p-limit.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;
