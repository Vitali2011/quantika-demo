/**
 * Tests for scripts/knowledge-jwc-yaml-seed.ts
 * Verifies YAML→chunks conversion and embedAndStore call.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';
import fs from 'fs';

// Explicit factory mocks — governance imports @sentry/nextjs which blocks auto-mock
jest.mock('@/lib/knowledge/governance', () => ({
  reportSyncStarted: jest.fn(),
  reportSyncSuccess: jest.fn(),
  reportSyncFailure: jest.fn(),
  registerSource: jest.fn(),
}));
jest.mock('@/lib/knowledge/embeddings/pipeline', () => ({
  embedAndStore: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  getDb: jest.fn(() => ({})),
}));

import * as governance from '@/lib/knowledge/governance';
import * as pipeline from '@/lib/knowledge/embeddings/pipeline';
import { syncJwcYaml } from '@/lib/knowledge/sources/jwc-yaml/adapter';

const scriptPath = path.join(process.cwd(), 'scripts/knowledge-jwc-yaml-seed.ts');

describe('JWC YAML seed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (governance.reportSyncStarted as jest.Mock).mockReturnValue(1);
    (governance.reportSyncSuccess as jest.Mock).mockReturnValue(undefined);
    (governance.reportSyncFailure as jest.Mock).mockReturnValue(undefined);
    (pipeline.embedAndStore as jest.Mock).mockResolvedValue(undefined);
  });

  describe('script file', () => {
    it('exists at expected path', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('contains --dry-run flag handling', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('--dry-run');
      expect(content).toContain('syncJwcYaml');
    });
  });

  describe('syncJwcYaml', () => {
    it('returns chunksStored > 0 for valid YAML (dry-run)', async () => {
      const result = await syncJwcYaml({ dryRun: true });
      expect(result.chunksStored).toBeGreaterThan(0);
      expect(result.zonesProcessed).toBeGreaterThan(0);
    });

    it('does not call embedAndStore in dry-run mode', async () => {
      await syncJwcYaml({ dryRun: true });
      expect(pipeline.embedAndStore).not.toHaveBeenCalled();
    });

    it('calls embedAndStore once with jwc_vec and jwc_fts in full mode', async () => {
      await syncJwcYaml({ dryRun: false });
      expect(pipeline.embedAndStore).toHaveBeenCalledTimes(1);
      const callArgs = (pipeline.embedAndStore as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toMatchObject({
        tableName: 'jwc_vec',
        ftsTable: 'jwc_fts',
      });
    });

    it('each chunk has non-empty content and jwc metadata', async () => {
      let capturedChunks: Array<{ content: string; metadata: Record<string, unknown> }> = [];
      (pipeline.embedAndStore as jest.Mock).mockImplementationOnce(
        async (chunks: Array<{ content: string; metadata: Record<string, unknown> }>) => {
          capturedChunks = chunks;
        }
      );

      await syncJwcYaml({ dryRun: false });

      expect(capturedChunks.length).toBeGreaterThan(0);
      for (const chunk of capturedChunks) {
        expect(chunk.content.length).toBeGreaterThan(10);
        expect(chunk.metadata.source).toBe('jwc');
        expect(chunk.metadata.zone_id).toBeTruthy();
        expect(chunk.metadata.bulletin_ref).toBeTruthy();
      }
    });

    it('chunk content includes zone name, rate, and notes', async () => {
      let capturedChunks: Array<{ content: string; metadata: Record<string, unknown> }> = [];
      (pipeline.embedAndStore as jest.Mock).mockImplementationOnce(
        async (chunks: Array<{ content: string; metadata: Record<string, unknown> }>) => {
          capturedChunks = chunks;
        }
      );

      await syncJwcYaml({ dryRun: false });

      const redSeaChunk = capturedChunks.find(c => c.metadata.zone_id === 'red-sea');
      expect(redSeaChunk).toBeDefined();
      expect(redSeaChunk!.content).toContain('Red Sea');
      expect(redSeaChunk!.content).toContain('0.2');
    });
  });
});
