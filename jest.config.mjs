import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
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
