// Global test setup — runs after Jest is initialized in each test file.
//
// NOTE: After spec-01 is merged and lib/session.ts delegates to
// lib/session-store.ts (better-sqlite3), add isolation here, e.g.:
//   jest.mock('better-sqlite3', () => require('better-sqlite3')(':memory:'));
// or configure moduleNameMapper in jest.config.mjs to redirect to
// better-sqlite3-memory for native-building-free CI environments.

// Use in-memory SQLite for session tests so each jest.resetModules() starts fresh
process.env.SESSIONS_DB_PATH = ':memory:';

// Stub global fetch to prevent accidental real HTTP calls in unit tests
global.fetch = jest.fn() as typeof global.fetch;

// Provide a minimal window object so analytics (posthog) guards work in node test env
// Defined as a configurable getter so jest.spyOn(global, 'window', 'get') works in tests
Object.defineProperty(global, 'window', {
  get: () => global,
  configurable: true,
});
