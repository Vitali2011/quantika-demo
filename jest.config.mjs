import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  // Exclude .wave worktrees only when running from the main repo (not from within a worktree)
  testPathIgnorePatterns: ['/node_modules/', ...(process.cwd().includes('/.wave/') ? [] : ['/.wave/'])],
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
