/**
 * Regression: RC-bimco-seed
 *
 * Verifies that seed-bimco-clauses.ts:
 * 1. Exists at the expected path
 * 2. syncBimcoRag inserts > 0 rows (calls embedAndStore with bimco_fts)
 * 3. Is idempotent — adapter uses truncate:true, so re-run doesn't duplicate
 *
 * Spec: F-04
 */

import fs from 'fs';
import path from 'path';

// Factory mocks — governance imports @sentry/nextjs which blocks auto-mock
jest.mock('@/lib/knowledge/governance', () => ({
  reportSyncStarted: jest.fn(),
  reportSyncSuccess: jest.fn(),
  reportSyncFailure: jest.fn(),
  registerSource: jest.fn(),
}));
jest.mock('@/lib/knowledge/embeddings/pipeline', () => ({
  embedAndStore: jest.fn(),
}));

import * as governance from '@/lib/knowledge/governance';
import * as pipeline from '@/lib/knowledge/embeddings/pipeline';
import { syncBimcoRag } from '@/lib/knowledge/sources/bimco/adapter';
import { BIMCO_FIXTURE_CLAUSES } from '@/lib/knowledge/sources/bimco/fixture';

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/seed-bimco-clauses.ts');

describe('RC-bimco-seed — seed-bimco-clauses.ts', () => {
  const mockDb = {} as import('better-sqlite3').Database;

  beforeEach(() => {
    jest.clearAllMocks();
    (governance.reportSyncStarted as jest.Mock).mockReturnValue(1);
    (governance.reportSyncSuccess as jest.Mock).mockReturnValue(undefined);
    (governance.reportSyncFailure as jest.Mock).mockReturnValue(undefined);
    (pipeline.embedAndStore as jest.Mock).mockResolvedValue(undefined);
  });

  describe('script file', () => {
    it('exists at scripts/seed-bimco-clauses.ts', () => {
      expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
    });

    it('imports syncBimcoRag or refresh-bimco-rag', () => {
      const content = fs.readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toMatch(/syncBimcoRag|refresh-bimco-rag/);
    });
  });

  describe('syncBimcoRag adapter', () => {
    it('calls embedAndStore with > 0 chunks (bimco_fts)', async () => {
      await syncBimcoRag(mockDb, false);

      expect(pipeline.embedAndStore).toHaveBeenCalledTimes(1);
      const [chunks, opts] = (pipeline.embedAndStore as jest.Mock).mock.calls[0];

      expect(chunks.length).toBeGreaterThan(0);
      expect(opts.ftsTable).toBe('bimco_fts');
    });

    it('stored count equals fixture clause count', async () => {
      const result = await syncBimcoRag(mockDb, false);
      expect(result.stored).toBe(BIMCO_FIXTURE_CLAUSES.length);
      expect(result.stored).toBeGreaterThan(0);
    });

    it('idempotency: uses truncate:true so re-run overwrites', async () => {
      await syncBimcoRag(mockDb, false);
      const [, opts] = (pipeline.embedAndStore as jest.Mock).mock.calls[0];
      expect(opts.truncate).toBe(true);
    });

    it('dry-run skips embedAndStore but returns correct count', async () => {
      const result = await syncBimcoRag(mockDb, true);
      expect(pipeline.embedAndStore).not.toHaveBeenCalled();
      expect(result.stored).toBeGreaterThan(0);
    });

    it('each chunk has bimco source metadata', async () => {
      let capturedChunks: Array<{ content: string; metadata: Record<string, unknown> }> = [];
      (pipeline.embedAndStore as jest.Mock).mockImplementationOnce(
        async (chunks: typeof capturedChunks) => {
          capturedChunks = chunks;
        }
      );

      await syncBimcoRag(mockDb, false);

      expect(capturedChunks.length).toBeGreaterThan(0);
      for (const chunk of capturedChunks) {
        expect(chunk.content.length).toBeGreaterThan(10);
        expect(chunk.metadata.source).toBe('bimco');
        expect(chunk.metadata.charterParty).toBeTruthy();
        expect(chunk.metadata.title).toBeTruthy();
      }
    });
  });
});
