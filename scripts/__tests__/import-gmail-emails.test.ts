/**
 * Tests for scripts/import-gmail-emails.ts
 *
 * Strategy:
 * - Mock `fs` (mkdirSync, writeFileSync, existsSync) to avoid real I/O.
 * - Mock `./lib/oauth-shared` via { virtual: true } — the file doesn't exist
 *   yet in this worktree (cross-spec dependency, spec-02).
 * - Inject a mock Gmail client directly through RunOptions.gmailClient so no
 *   real OAuth credentials are needed.
 * - Use the exported `run()` function to test behavior end-to-end without
 *   spawning a subprocess.
 */

// ── Mock oauth-shared (virtual — spec-02 cross-dep, file not yet on disk) ───
jest.mock('../lib/oauth-shared', () => ({
  loadOAuthCredentials: jest.fn(() => ({
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    redirect_uri: 'http://localhost:3000/callback',
  })),
  loadRefreshToken: jest.fn(() => 'test-refresh-token'),
  createGmailClient: jest.fn(),
}), { virtual: true });

// ── Mock fs selectively ──────────────────────────────────────────────────────
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(false),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

import * as fs from 'fs';
import * as path from 'path';
import { run } from '../import-gmail-emails';
import type { RunOptions } from '../import-gmail-emails';

const mockExistsSync = fs.existsSync as jest.Mock;
const mockMkdirSync = fs.mkdirSync as jest.Mock;
const mockWriteFileSync = fs.writeFileSync as jest.Mock;

// ── Gmail API mock factory ──────────────────────────────────────────────────

function makeGmailMock(opts: {
  threads?: Array<{ id: string; snippet?: string }>;
  nextPageToken?: string;
  threadGetData?: (id: string) => object;
  getError?: Error | ((id: string) => Error | undefined);
}) {
  const {
    threads = [],
    nextPageToken,
    threadGetData = (id: string) => ({
      id,
      historyId: 'h1',
      messages: [],
      snippet: `snippet for ${id}`,
    }),
    getError,
  } = opts;

  const mockList = jest.fn().mockResolvedValue({
    data: { threads, nextPageToken },
  });

  const mockGet = jest.fn(async ({ id }: { id: string }) => {
    if (getError) {
      const err = typeof getError === 'function' ? getError(id) : getError;
      if (err) throw err;
    }
    return { data: threadGetData(id) };
  });

  return {
    users: { threads: { list: mockList, get: mockGet } },
    _mockList: mockList,
    _mockGet: mockGet,
  } as unknown as import('googleapis').gmail_v1.Gmail & {
    _mockList: jest.Mock;
    _mockGet: jest.Mock;
  };
}

const OUT = '/fake/raw-emails';

function baseOpts(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    dryRun: false,
    limit: null,
    since: undefined,
    force: false,
    outputDir: OUT,
    ...overrides,
  };
}

// ── Setup ───────────────────────────────────────────────────────────────────

let consoleSpy: jest.SpyInstance;
let consoleErrSpy: jest.SpyInstance;

beforeEach(() => {
  mockExistsSync.mockReturnValue(false);
  mockMkdirSync.mockReset();
  mockWriteFileSync.mockReset();
  consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleSpy.mockRestore();
  consoleErrSpy.mockRestore();
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('run() — import-gmail-emails', () => {

  describe('fails fast when refresh_token missing', () => {
    it('calls process.exit(1) and prints setup instructions', async () => {
      const { loadRefreshToken } = await import('../lib/oauth-shared');
      (loadRefreshToken as jest.Mock).mockImplementationOnce(() => {
        throw new Error('file not found');
      });

      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit:1');
      }) as (code?: number) => never);

      // run() without gmailClient will call loadRefreshToken
      await expect(run(baseOpts())).rejects.toThrow('exit:1');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  describe('--dry-run flag', () => {
    it('does NOT write any files', async () => {
      const gmail = makeGmailMock({ threads: [{ id: 't1' }, { id: 't2' }] });
      await run(baseOpts({ dryRun: true, gmailClient: gmail }));
      expect(mockWriteFileSync).not.toHaveBeenCalled();
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('prints dry-run notice in log', async () => {
      const gmail = makeGmailMock({ threads: [] });
      await run(baseOpts({ dryRun: true, gmailClient: gmail }));
      const allLogs = consoleSpy.mock.calls.flat().join(' ');
      expect(allLogs).toContain('dry-run');
    });

    it('logs would-fetch entries for each thread', async () => {
      const gmail = makeGmailMock({ threads: [{ id: 'dry-t1' }] });
      await run(baseOpts({ dryRun: true, gmailClient: gmail }));
      const allLogs = consoleSpy.mock.calls.flat().join(' ');
      expect(allLogs).toContain('dry-run');
      expect(allLogs).toContain('dry-t1');
    });
  });

  describe('skip existing files', () => {
    it('skips thread when file exists and force=false', async () => {
      mockExistsSync.mockReturnValue(true);
      const gmail = makeGmailMock({ threads: [{ id: 's1' }] });

      const result = await run(baseOpts({ gmailClient: gmail }));

      expect(mockWriteFileSync).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
      expect(result.written).toBe(0);
    });

    it('logs "skip: <id>" for skipped threads', async () => {
      mockExistsSync.mockReturnValue(true);
      const gmail = makeGmailMock({ threads: [{ id: 'skip-me' }] });
      await run(baseOpts({ gmailClient: gmail }));

      const skipLogs = consoleSpy.mock.calls.flat().filter((c) => String(c).includes('skip:'));
      expect(skipLogs.length).toBeGreaterThan(0);
    });

    it('overwrites when force=true even if file exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const gmail = makeGmailMock({ threads: [{ id: 'f1' }] });

      const result = await run(baseOpts({ force: true, gmailClient: gmail }));

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(result.written).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  describe('--limit flag', () => {
    it('processes at most N threads', async () => {
      const gmail = makeGmailMock({
        threads: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }, { id: 'l4' }, { id: 'l5' }],
      });

      const result = await run(baseOpts({ limit: 2, gmailClient: gmail }));

      expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
      expect(result.written).toBe(2);
    });

    it('returns all threads when limit exceeds count', async () => {
      const gmail = makeGmailMock({ threads: [{ id: 'a1' }] });
      const result = await run(baseOpts({ limit: 100, gmailClient: gmail }));
      expect(result.written).toBe(1);
    });
  });

  describe('--since flag', () => {
    it('passes after: clause in Gmail query', async () => {
      const gmail = makeGmailMock({ threads: [] });
      await run(baseOpts({ since: '2026-01-01', gmailClient: gmail }));

      const allLogs = consoleSpy.mock.calls.flat().join(' ');
      expect(allLogs).toContain('after:2026/01/01');
    });
  });

  describe('Gmail query format', () => {
    it('uses quoted label name with spaces and underscores', async () => {
      const gmail = makeGmailMock({ threads: [] });
      await run(baseOpts({ gmailClient: gmail }));

      const allLogs = consoleSpy.mock.calls.flat().join(' ');
      expect(allLogs).toContain('label:"_ ETMS - Management"');
    });
  });

  describe('output file format', () => {
    it('writes pretty JSON with 2-space indent', async () => {
      const payload = {
        id: 'th1',
        historyId: 'hist42',
        messages: [{ id: 'msg1', payload: { headers: [] } }],
        snippet: 'test snippet',
      };
      const gmail = makeGmailMock({
        threads: [{ id: 'th1' }],
        threadGetData: () => payload,
      });

      await run(baseOpts({ gmailClient: gmail }));

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [writtenPath, writtenContent, encoding] = mockWriteFileSync.mock.calls[0];

      expect(String(writtenPath)).toContain(path.join('raw-emails', 'th1.json'));
      expect(encoding).toBe('utf-8');

      const parsed = JSON.parse(String(writtenContent));
      expect(parsed).toMatchObject(payload);

      // Verify 2-space indent: top-level keys start at exactly 2 spaces (JSON.stringify null, 2)
      expect(String(writtenContent)).toContain('\n  "id"');
      // Confirm it's not minified (single-line)
      expect(String(writtenContent)).toContain('\n');
    });

    it('stores full thread payload without modification', async () => {
      const payload = {
        id: 'th2',
        historyId: 'h200',
        messages: [
          {
            id: 'm1',
            payload: {
              headers: [{ name: 'Subject', value: 'Test' }],
              body: { size: 42, data: 'base64data==' },
              parts: [{ mimeType: 'text/plain', body: { data: 'aGVsbG8=' } }],
            },
          },
        ],
        snippet: 'full payload test',
      };
      const gmail = makeGmailMock({
        threads: [{ id: 'th2' }],
        threadGetData: () => payload,
      });

      await run(baseOpts({ gmailClient: gmail }));

      const written = JSON.parse(String(mockWriteFileSync.mock.calls[0][1]));
      expect(written.messages[0].payload.body.data).toBe('base64data==');
      expect(written.messages[0].payload.parts[0].body.data).toBe('aGVsbG8=');
    });
  });

  describe('429 backoff / error handling', () => {
    it('continues to next thread when thread.get fails with 429 after retries', async () => {
      const err429 = Object.assign(new Error('Too Many Requests'), { status: 429 });
      const gmail = makeGmailMock({
        threads: [{ id: 'err1' }, { id: 'ok1' }],
        // err1 always fails, ok1 succeeds
        getError: (id: string) => (id === 'err1' ? err429 : undefined),
      });

      // Make withBackoff give up quickly by using fake timers
      jest.useFakeTimers();
      const resultPromise = run(baseOpts({ gmailClient: gmail }));
      await jest.runAllTimersAsync();
      const result = await resultPromise;
      jest.useRealTimers();

      // ok1 should still be written
      expect(result.errors).toBeGreaterThanOrEqual(1);
      expect(result.written).toBe(1);
    });

    it('logs error message with thread id when thread.get fails', async () => {
      const errMsg = Object.assign(new Error('API Error'), { status: 500 });
      const gmail = makeGmailMock({
        threads: [{ id: 'bad-t' }],
        getError: errMsg,
      });

      await run(baseOpts({ gmailClient: gmail }));

      const errLogs = consoleErrSpy.mock.calls.flat().join(' ');
      expect(errLogs).toContain('bad-t');
    });
  });

  describe('pagination', () => {
    it('fetches all pages via nextPageToken', async () => {
      // Two-page scenario: simulate by creating a gmail mock that on first call
      // returns nextPageToken='page2' and on second call returns no token.
      let callCount = 0;
      const mockList = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { data: { threads: [{ id: 'p1-t1' }], nextPageToken: 'page2' } };
        }
        return { data: { threads: [{ id: 'p2-t1' }], nextPageToken: undefined } };
      });
      const mockGet = jest.fn(async ({ id }: { id: string }) => ({
        data: { id, historyId: 'h1', messages: [], snippet: '' },
      }));

      const gmail = {
        users: { threads: { list: mockList, get: mockGet } },
      } as unknown as import('googleapis').gmail_v1.Gmail;

      const result = await run(baseOpts({ gmailClient: gmail }));
      expect(result.written).toBe(2);
      expect(mockList).toHaveBeenCalledTimes(2);
    });
  });

  describe('outputDir', () => {
    it('creates output directory before writing', async () => {
      const gmail = makeGmailMock({ threads: [{ id: 'dir-t' }] });
      await run(baseOpts({ gmailClient: gmail, outputDir: '/custom/dir' }));
      expect(mockMkdirSync).toHaveBeenCalledWith('/custom/dir', { recursive: true });
    });

    it('writes files under the correct outputDir', async () => {
      const gmail = makeGmailMock({ threads: [{ id: 'out-t' }] });
      await run(baseOpts({ gmailClient: gmail, outputDir: '/my/output' }));
      expect(mockWriteFileSync.mock.calls[0][0]).toBe(
        path.join('/my/output', 'out-t.json'),
      );
    });
  });
});
