/**
 * Tests for scripts/knowledge/refresh.ts dispatcher
 *
 * Phase 2a RED tests:
 * 1. KNOWN_SLUGS contains 'fx-rates' (source text check)
 * 2. getHandlers() map has 'fx-rates' key
 * 3. Calling handler for 'fx-rates' invokes sources/fx-rates refresh()
 * 4. main() exits(1) for unknown slug
 * 5. main() exits(1) when no argument provided
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock the dynamic import for sources/fx-rates
const mockFxRatesRefresh = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../../../scripts/knowledge/sources/fx-rates',
  () => ({ refresh: mockFxRatesRefresh }),
  { virtual: true },
);

// Capture process.exit to avoid killing test runner
const mockExit = jest
  .spyOn(process, 'exit')
  .mockImplementation((code?: string | number | null | undefined) => {
    throw new Error(`process.exit(${code})`);
  });

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('knowledge refresh dispatcher', () => {
  const REFRESH_SRC = path.join(__dirname, '../../../scripts/knowledge/refresh.ts');

  afterAll(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  beforeEach(() => {
    mockFxRatesRefresh.mockClear();
    mockExit.mockClear();
    jest.resetModules();
  });

  // Test 1: source text check — 'fx-rates' in KNOWN_SLUGS
  it("source file contains 'fx-rates' in KNOWN_SLUGS", () => {
    const src = fs.readFileSync(REFRESH_SRC, 'utf-8');
    expect(src).toContain("'fx-rates'");
  });

  // Test 2: exported getHandlers() map has 'fx-rates'
  it("getHandlers() returns a map with 'fx-rates' key", async () => {
    const { getHandlers } = await import('../../../scripts/knowledge/refresh');
    const handlers = getHandlers();
    expect(handlers).toHaveProperty('fx-rates');
    expect(typeof handlers['fx-rates']).toBe('function');
  });

  // Test 3: handler for 'fx-rates' calls sources/fx-rates refresh()
  it("handler for 'fx-rates' calls sources/fx-rates refresh()", async () => {
    jest.doMock('../../../scripts/knowledge/sources/fx-rates', () => ({
      refresh: mockFxRatesRefresh,
    }));

    const { getHandlers } = await import('../../../scripts/knowledge/refresh');
    const handlers = getHandlers();
    await handlers['fx-rates']();
    expect(mockFxRatesRefresh).toHaveBeenCalledTimes(1);
  });

  // Test 4: main() exits with 1 for unknown slug
  it("main() exits with 1 for unknown slug", async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'refresh.ts', 'totally-unknown-slug-xyz'];
    try {
      const { main } = await import('../../../scripts/knowledge/refresh');
      await expect(main()).rejects.toThrow('process.exit(1)');
    } finally {
      process.argv = origArgv;
    }
  });

  // Test 5: main() exits with 1 when no argument
  it("main() exits with 1 when no slug argument provided", async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'refresh.ts'];
    try {
      const { main } = await import('../../../scripts/knowledge/refresh');
      await expect(main()).rejects.toThrow('process.exit(1)');
    } finally {
      process.argv = origArgv;
    }
  });
});
