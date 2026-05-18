// Global test setup — runs after Jest is initialized in each test file.
//
// NOTE: After spec-01 is merged and lib/session.ts delegates to
// lib/session-store.ts (better-sqlite3), add isolation here, e.g.:
//   jest.mock('better-sqlite3', () => require('better-sqlite3')(':memory:'));
// or configure moduleNameMapper in jest.config.mjs to redirect to
// better-sqlite3-memory for native-building-free CI environments.

// Use in-memory SQLite for session tests so each jest.resetModules() starts fresh
process.env.SESSIONS_DB_PATH = ':memory:';

// Polyfill TextEncoder/TextDecoder for jsdom test environment (needed by postal-mime/resend)
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// spec-βf-18: Pipedrive OAuth refresh requires client credentials. Default these
// so unit tests that exercise the refresh path don't have to set them
// individually. Tests that specifically validate "missing env" delete them.
process.env.PIPEDRIVE_CLIENT_ID = process.env.PIPEDRIVE_CLIENT_ID ?? 'test-client-id';
process.env.PIPEDRIVE_CLIENT_SECRET = process.env.PIPEDRIVE_CLIENT_SECRET ?? 'test-client-secret';

// Stub global fetch to prevent accidental real HTTP calls in unit tests.
// Returns a non-ok response by default; individual tests mock as needed.
global.fetch = jest.fn().mockResolvedValue({ ok: false }) as typeof global.fetch;

// Provide a minimal window object so analytics (posthog) guards work in node test env
// Defined as a configurable getter so jest.spyOn(global, 'window', 'get') works in tests
// Guard: in jsdom environment, window is already defined — skip the stub to avoid TypeError.
if (typeof window === 'undefined') {
  Object.defineProperty(global, 'window', {
    get: () => global,
    configurable: true,
  });
}
