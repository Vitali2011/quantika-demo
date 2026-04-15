// Global test setup — runs after Jest is initialized in each test file.
//
// NOTE: After spec-01 is merged and lib/session.ts delegates to
// lib/session-store.ts (better-sqlite3), add isolation here, e.g.:
//   jest.mock('better-sqlite3', () => require('better-sqlite3')(':memory:'));
// or configure moduleNameMapper in jest.config.mjs to redirect to
// better-sqlite3-memory for native-binding-free CI environments.
