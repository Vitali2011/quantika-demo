import * as path from 'path';

// Mock 'fs' before any imports that use it so the mock propagates into import-helpers
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
  };
});

import * as fs from 'fs';
import {
  shouldSkipThread,
  buildLabelQuery,
  withBackoff,
  threadFilePath,
  sleep,
} from '../import-helpers';

const mockExistsSync = fs.existsSync as jest.Mock;

// ── shouldSkipThread ────────────────────────────────────────────────────────

describe('shouldSkipThread', () => {
  afterEach(() => mockExistsSync.mockReset());

  it('returns false when force=true even if file exists', () => {
    mockExistsSync.mockReturnValue(true);
    expect(shouldSkipThread('/tmp/abc.json', true)).toBe(false);
  });

  it('returns true when force=false and file exists', () => {
    mockExistsSync.mockReturnValue(true);
    expect(shouldSkipThread('/tmp/abc.json', false)).toBe(true);
  });

  it('returns false when force=false and file does NOT exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(shouldSkipThread('/tmp/abc.json', false)).toBe(false);
  });
});

// ── buildLabelQuery ─────────────────────────────────────────────────────────

describe('buildLabelQuery', () => {
  it('wraps label name in double-quotes', () => {
    const q = buildLabelQuery('_ ETMS - Management');
    expect(q).toBe('label:"_ ETMS - Management"');
  });

  it('appends after: clause when sinceDate provided', () => {
    const q = buildLabelQuery('_ ETMS - Management', '2026-01-15');
    expect(q).toBe('label:"_ ETMS - Management" after:2026/01/15');
  });

  it('converts YYYY-MM-DD dashes to YYYY/MM/DD slashes', () => {
    const q = buildLabelQuery('My Label', '2025-12-31');
    expect(q).toContain('after:2025/12/31');
  });

  it('no after: clause when sinceDate is undefined', () => {
    const q = buildLabelQuery('Test Label');
    expect(q).not.toContain('after:');
  });
});

// ── withBackoff ─────────────────────────────────────────────────────────────
// We rely on jest fake timers so sleep() calls don't block tests.

describe('withBackoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns value when fn succeeds on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withBackoff(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 status and succeeds eventually', async () => {
    const err429 = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(err429)
      .mockRejectedValueOnce(err429)
      .mockResolvedValue('done');

    const resultPromise = withBackoff(fn, 3);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after maxRetries exhausted on 429', async () => {
    const err429 = Object.assign(new Error('Rate limit'), { status: 429 });
    const fn = jest.fn().mockRejectedValue(err429);

    // Wrap the call so we can catch the rejection and still advance timers
    let caught: unknown = null;
    const resultPromise = withBackoff(fn, 3).catch((e) => { caught = e; });

    // Run timers repeatedly to process all backoff sleeps (1s, 2s, 4s)
    for (let i = 0; i < 5; i++) {
      await jest.runAllTimersAsync();
    }
    await resultPromise;

    expect(caught).toMatchObject({ status: 429 });
    // initial attempt + 3 retries = 4 total calls
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('does NOT retry on non-429 errors', async () => {
    const errOther = new Error('Not found');
    const fn = jest.fn().mockRejectedValue(errOther);

    const resultPromise = withBackoff(fn, 3);
    // No timers needed since we fail immediately without backoff
    await expect(resultPromise).rejects.toThrow('Not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('detects rate limit via response.status', async () => {
    const errWrapped = Object.assign(new Error('wrapped'), {
      response: { status: 429 },
    });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(errWrapped)
      .mockResolvedValue('recovered');

    const resultPromise = withBackoff(fn, 3);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ── threadFilePath ──────────────────────────────────────────────────────────

describe('threadFilePath', () => {
  it('joins outputDir and threadId with .json extension', () => {
    const result = threadFilePath('/home/user/.private/raw-emails', 'abc123');
    expect(result).toBe(path.join('/home/user/.private/raw-emails', 'abc123.json'));
  });
});
