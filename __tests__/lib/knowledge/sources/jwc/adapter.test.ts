import { syncJwcRag } from '@/lib/knowledge/sources/jwc/adapter';
import * as scraper from '@/lib/knowledge/sources/jwc/scraper';
import * as chunker from '@/lib/knowledge/sources/jwc/chunker';
import * as governance from '@/lib/knowledge/governance';
import * as pipeline from '@/lib/knowledge/embeddings/pipeline';
import { getDb } from '@/lib/db';

jest.mock('@/lib/knowledge/sources/jwc/scraper');
jest.mock('@/lib/knowledge/sources/jwc/chunker');
jest.mock('@/lib/knowledge/governance');
jest.mock('@/lib/knowledge/embeddings/pipeline');
jest.mock('@/lib/db');

describe('lib/knowledge/sources/jwc/adapter', () => {
  describe('syncJwcRag', () => {
    const mockDb = {} as any;

    beforeEach(() => {
      jest.clearAllMocks();
      (getDb as jest.Mock).mockReturnValue(mockDb);
      process.env.JWC_SOURCE_URL = 'https://example.com/jwc';
    });

    afterEach(() => {
      delete process.env.JWC_SOURCE_URL;
    });

    // TC-NBI-07: Missing env var (undefined)
    it('should throw when JWC_SOURCE_URL is not set', async () => {
      delete process.env.JWC_SOURCE_URL;

      await expect(syncJwcRag()).rejects.toThrow('JWC_SOURCE_URL env var is required');
    });

    // TC-NBI-08: Empty env var
    it('should throw when JWC_SOURCE_URL is empty string', async () => {
      process.env.JWC_SOURCE_URL = '';

      await expect(syncJwcRag()).rejects.toThrow('JWC_SOURCE_URL env var is required');
    });

    // dryRun mode — calls scrape+chunk but not embedAndStore
    it('should skip embedAndStore in dryRun mode', async () => {
      const mockBulletins = [
        {
          id: 'JWLA-001',
          publishDate: '2025-01-15',
          title: 'Test',
          rawText: 'Black Sea risk.',
          sourceUrl: 'https://example.com/001',
        },
      ];

      const mockChunks = [
        {
          content: 'Black Sea risk.',
          metadata: {
            source: 'jwc',
            bulletinId: 'JWLA-001',
            publishDate: '2025-01-15',
            title: 'Test',
            sourceUrl: 'https://example.com/001',
            regions: ['Black Sea'],
            chunkIndex: 0,
          },
        },
      ];

      (scraper.scrapeJwc as jest.Mock).mockResolvedValue(mockBulletins);
      (chunker.chunkJwc as jest.Mock).mockReturnValue(mockChunks);
      (governance.reportSyncStarted as jest.Mock).mockReturnValue(123);
      (governance.reportSyncSuccess as jest.Mock).mockResolvedValue(undefined);

      const result = await syncJwcRag({ dryRun: true });

      expect(scraper.scrapeJwc).toHaveBeenCalledWith('https://example.com/jwc');
      expect(chunker.chunkJwc).toHaveBeenCalledWith(mockBulletins);
      expect(pipeline.embedAndStore).not.toHaveBeenCalled();
      expect(governance.reportSyncSuccess).toHaveBeenCalled();
      expect(result).toEqual({ chunksStored: 0, bulletinsScraped: 1 });
    });

    // Successful sync — calls governance lifecycle in correct order
    it('should call governance lifecycle in correct order', async () => {
      const mockBulletins = [
        {
          id: 'JWLA-001',
          publishDate: '2025-01-15',
          title: 'Test',
          rawText: 'Red Sea alert.',
          sourceUrl: 'https://example.com/001',
        },
      ];

      const mockChunks = [
        {
          content: 'Red Sea alert.',
          metadata: {
            source: 'jwc',
            bulletinId: 'JWLA-001',
            publishDate: '2025-01-15',
            title: 'Test',
            sourceUrl: 'https://example.com/001',
            regions: ['Red Sea'],
            chunkIndex: 0,
          },
        },
      ];

      (scraper.scrapeJwc as jest.Mock).mockResolvedValue(mockBulletins);
      (chunker.chunkJwc as jest.Mock).mockReturnValue(mockChunks);
      (governance.reportSyncStarted as jest.Mock).mockReturnValue(456);
      (governance.reportSyncSuccess as jest.Mock).mockResolvedValue(undefined);
      (pipeline.embedAndStore as jest.Mock).mockResolvedValue(undefined);

      const result = await syncJwcRag();

      const calls = [
        governance.reportSyncStarted,
        scraper.scrapeJwc,
        chunker.chunkJwc,
        pipeline.embedAndStore,
        governance.reportSyncSuccess,
      ];

      for (let i = 0; i < calls.length - 1; i++) {
        const currentCall = (calls[i] as jest.Mock).mock.invocationCallOrder[0];
        const nextCall = (calls[i + 1] as jest.Mock).mock.invocationCallOrder[0];
        expect(currentCall).toBeLessThan(nextCall);
      }

      expect(result).toEqual({ chunksStored: 1, bulletinsScraped: 1 });
    });

    // TC-NBI-09: Zero bulletins scraped
    it('should handle zero bulletins scraped', async () => {
      (scraper.scrapeJwc as jest.Mock).mockResolvedValue([]);
      (chunker.chunkJwc as jest.Mock).mockReturnValue([]);
      (governance.reportSyncStarted as jest.Mock).mockReturnValue(789);
      (governance.reportSyncSuccess as jest.Mock).mockResolvedValue(undefined);
      (pipeline.embedAndStore as jest.Mock).mockResolvedValue(undefined);

      const result = await syncJwcRag();

      expect(governance.reportSyncSuccess).toHaveBeenCalledWith(
        mockDb,
        789,
        expect.objectContaining({ rowsChanged: 0 })
      );
      expect(result).toEqual({ chunksStored: 0, bulletinsScraped: 0 });
    });

    // Scraper failure — reports failure to governance, re-throws
    it('should report scraper failure to governance and re-throw', async () => {
      const scraperError = new Error('Scraper network error');

      (scraper.scrapeJwc as jest.Mock).mockRejectedValue(scraperError);
      (governance.reportSyncStarted as jest.Mock).mockReturnValue(111);
      (governance.reportSyncFailure as jest.Mock).mockResolvedValue(undefined);

      await expect(syncJwcRag()).rejects.toThrow('Scraper network error');

      expect(governance.reportSyncFailure).toHaveBeenCalledWith(
        mockDb,
        111,
        scraperError
      );
      expect(governance.reportSyncSuccess).not.toHaveBeenCalled();
    });

    // embedAndStore failure — reports failure to governance, re-throws
    it('should report embedAndStore failure to governance and re-throw', async () => {
      const embedError = new Error('Embedding API failure');

      const mockBulletins = [
        {
          id: 'JWLA-002',
          publishDate: '2025-01-20',
          title: 'Test',
          rawText: 'Test content.',
          sourceUrl: 'https://example.com/002',
        },
      ];

      const mockChunks = [
        {
          content: 'Test content.',
          metadata: {
            source: 'jwc',
            bulletinId: 'JWLA-002',
            publishDate: '2025-01-20',
            title: 'Test',
            sourceUrl: 'https://example.com/002',
            regions: [],
            chunkIndex: 0,
          },
        },
      ];

      (scraper.scrapeJwc as jest.Mock).mockResolvedValue(mockBulletins);
      (chunker.chunkJwc as jest.Mock).mockReturnValue(mockChunks);
      (governance.reportSyncStarted as jest.Mock).mockReturnValue(222);
      (pipeline.embedAndStore as jest.Mock).mockRejectedValue(embedError);
      (governance.reportSyncFailure as jest.Mock).mockResolvedValue(undefined);

      await expect(syncJwcRag()).rejects.toThrow('Embedding API failure');

      expect(governance.reportSyncFailure).toHaveBeenCalledWith(mockDb, 222, embedError);
      expect(governance.reportSyncSuccess).not.toHaveBeenCalled();
    });

    // Returns correct counts
    it('should return correct counts for chunksStored and bulletinsScraped', async () => {
      const mockBulletins = [
        {
          id: 'JWLA-001',
          publishDate: '2025-01-15',
          title: 'Bulletin 1',
          rawText: 'Content 1.',
          sourceUrl: 'https://example.com/001',
        },
        {
          id: 'JWLA-002',
          publishDate: '2025-01-20',
          title: 'Bulletin 2',
          rawText: 'Content 2.',
          sourceUrl: 'https://example.com/002',
        },
      ];

      const mockChunks = [
        {
          content: 'Content 1.',
          metadata: {
            source: 'jwc',
            bulletinId: 'JWLA-001',
            publishDate: '2025-01-15',
            title: 'Bulletin 1',
            sourceUrl: 'https://example.com/001',
            regions: [],
            chunkIndex: 0,
          },
        },
        {
          content: 'Content 2.',
          metadata: {
            source: 'jwc',
            bulletinId: 'JWLA-002',
            publishDate: '2025-01-20',
            title: 'Bulletin 2',
            sourceUrl: 'https://example.com/002',
            regions: [],
            chunkIndex: 0,
          },
        },
      ];

      (scraper.scrapeJwc as jest.Mock).mockResolvedValue(mockBulletins);
      (chunker.chunkJwc as jest.Mock).mockReturnValue(mockChunks);
      (governance.reportSyncStarted as jest.Mock).mockReturnValue(333);
      (governance.reportSyncSuccess as jest.Mock).mockResolvedValue(undefined);
      (pipeline.embedAndStore as jest.Mock).mockResolvedValue(undefined);

      const result = await syncJwcRag();

      expect(result).toEqual({ chunksStored: 2, bulletinsScraped: 2 });
    });

    // Custom db option
    it('should use custom db when provided', async () => {
      const customDb = { custom: true } as any;

      const mockBulletins = [
        {
          id: 'JWLA-003',
          publishDate: '2025-01-25',
          title: 'Test',
          rawText: 'Custom DB test.',
          sourceUrl: 'https://example.com/003',
        },
      ];

      const mockChunks = [
        {
          content: 'Custom DB test.',
          metadata: {
            source: 'jwc',
            bulletinId: 'JWLA-003',
            publishDate: '2025-01-25',
            title: 'Test',
            sourceUrl: 'https://example.com/003',
            regions: [],
            chunkIndex: 0,
          },
        },
      ];

      (scraper.scrapeJwc as jest.Mock).mockResolvedValue(mockBulletins);
      (chunker.chunkJwc as jest.Mock).mockReturnValue(mockChunks);
      (governance.reportSyncStarted as jest.Mock).mockReturnValue(444);
      (governance.reportSyncSuccess as jest.Mock).mockResolvedValue(undefined);
      (pipeline.embedAndStore as jest.Mock).mockResolvedValue(undefined);

      await syncJwcRag({ db: customDb });

      expect(governance.reportSyncStarted).toHaveBeenCalledWith(customDb, 'jwc');
      expect(pipeline.embedAndStore).toHaveBeenCalledWith(
        mockChunks,
        expect.objectContaining({ db: customDb })
      );
    });
  });
});
