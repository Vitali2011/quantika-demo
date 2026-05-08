/**
 * Tests for lib/knowledge/sources/igc/adapter.ts
 * Verifies governance lifecycle, dryRun, error handling.
 */

// Explicit factory mocks — governance imports @sentry/nextjs which blocks auto-mock
jest.mock('@/lib/knowledge/governance', () => ({
  reportSyncStarted: jest.fn(),
  reportSyncSuccess: jest.fn(),
  reportSyncFailure: jest.fn(),
}));
jest.mock('@/lib/knowledge/embeddings/pipeline', () => ({
  embedAndStore: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  getDb: jest.fn(() => ({})),
}));
jest.mock('@/lib/knowledge/sources/igc/scraper', () => ({
  scrapeIgc: jest.fn(),
}));
jest.mock('@/lib/knowledge/sources/igc/chunker', () => ({
  chunkIgc: jest.fn(),
}));

import * as governance from '@/lib/knowledge/governance';
import * as pipeline from '@/lib/knowledge/embeddings/pipeline';
import * as scraper from '@/lib/knowledge/sources/igc/scraper';
import * as chunker from '@/lib/knowledge/sources/igc/chunker';
import { getDb } from '@/lib/db';
import { syncIgc } from '@/lib/knowledge/sources/igc/adapter';

const mockDb = {} as ReturnType<typeof getDb>;

const mockSection = {
  sectionId: 'SECTION-1',
  title: 'General Provisions',
  rawHtml: '<p>IGC content</p>',
  sourceUrl: 'https://www.imorules.com/INTGRAIN_SEC1.html',
};

const mockChunk = {
  content: 'IGC content',
  metadata: {
    source: 'igc',
    sourceUrl: 'https://www.imorules.com/INTGRAIN_SEC1.html',
    section: 'SECTION-1',
    title: 'General Provisions',
    subsectionIndex: 0,
  },
};

describe('syncIgc', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDb as jest.Mock).mockReturnValue(mockDb);
    (governance.reportSyncStarted as jest.Mock).mockReturnValue(1);
    (governance.reportSyncSuccess as jest.Mock).mockReturnValue(undefined);
    (governance.reportSyncFailure as jest.Mock).mockReturnValue(undefined);
    (pipeline.embedAndStore as jest.Mock).mockResolvedValue(undefined);
    (scraper.scrapeIgc as jest.Mock).mockResolvedValue([mockSection]);
    (chunker.chunkIgc as jest.Mock).mockReturnValue([mockChunk]);
  });

  it('throws when sourceUrl is empty', async () => {
    await expect(syncIgc({ sourceUrl: '' })).rejects.toThrow('IGC_SOURCE_URL is required');
    expect(governance.reportSyncStarted).not.toHaveBeenCalled();
  });

  it('throws when sourceUrl is not provided and env var is missing', async () => {
    const saved = process.env.IGC_SOURCE_URL;
    delete process.env.IGC_SOURCE_URL;
    await expect(syncIgc({})).rejects.toThrow('IGC_SOURCE_URL is required');
    if (saved !== undefined) process.env.IGC_SOURCE_URL = saved;
  });

  it('calls reportSyncStarted before scraping', async () => {
    await syncIgc({ sourceUrl: 'https://www.imorules.com/INTGRAIN.html' });
    const startOrder = (governance.reportSyncStarted as jest.Mock).mock.invocationCallOrder[0];
    const scrapeOrder = (scraper.scrapeIgc as jest.Mock).mock.invocationCallOrder[0];
    expect(startOrder).toBeLessThan(scrapeOrder);
  });

  it('dryRun skips embedAndStore and reports success with chunkCount', async () => {
    const result = await syncIgc({ dryRun: true, sourceUrl: 'https://www.imorules.com/INTGRAIN.html' });

    expect(pipeline.embedAndStore).not.toHaveBeenCalled();
    expect(governance.reportSyncSuccess).toHaveBeenCalledWith(
      mockDb,
      1,
      expect.objectContaining({ rowsChanged: 0, metadata: expect.objectContaining({ dryRun: true }) })
    );
    expect(result).toEqual({ syncLogId: 1, chunksProcessed: 1, sectionsScraped: 1, dryRun: true });
  });

  it('full run calls embedAndStore with igc_vec and igc_fts', async () => {
    await syncIgc({ sourceUrl: 'https://www.imorules.com/INTGRAIN.html' });

    expect(pipeline.embedAndStore).toHaveBeenCalledTimes(1);
    const [chunks, opts] = (pipeline.embedAndStore as jest.Mock).mock.calls[0];
    expect(chunks).toEqual([mockChunk]);
    expect(opts).toMatchObject({ tableName: 'igc_vec', ftsTable: 'igc_fts', truncate: true });
  });

  it('full run reports success with rowsChanged = chunk count', async () => {
    (chunker.chunkIgc as jest.Mock).mockReturnValue([mockChunk, mockChunk]);

    const result = await syncIgc({ sourceUrl: 'https://www.imorules.com/INTGRAIN.html' });

    expect(governance.reportSyncSuccess).toHaveBeenCalledWith(
      mockDb,
      1,
      expect.objectContaining({ rowsChanged: 2 })
    );
    expect(result.chunksProcessed).toBe(2);
    expect(result.sectionsScraped).toBe(1);
  });

  it('reports failure and re-throws when scraper throws', async () => {
    const err = new Error('IGC scrape failed');
    (scraper.scrapeIgc as jest.Mock).mockRejectedValue(err);

    await expect(syncIgc({ sourceUrl: 'https://www.imorules.com/INTGRAIN.html' })).rejects.toThrow('IGC scrape failed');
    expect(governance.reportSyncFailure).toHaveBeenCalledWith(mockDb, 1, err);
    expect(governance.reportSyncSuccess).not.toHaveBeenCalled();
  });

  it('reports failure and re-throws when embedAndStore throws', async () => {
    const err = new Error('Embed failed');
    (pipeline.embedAndStore as jest.Mock).mockRejectedValue(err);

    await expect(syncIgc({ sourceUrl: 'https://www.imorules.com/INTGRAIN.html' })).rejects.toThrow('Embed failed');
    expect(governance.reportSyncFailure).toHaveBeenCalledWith(mockDb, 1, err);
  });

  it('uses provided db instead of getDb()', async () => {
    const customDb = { custom: true } as any;
    await syncIgc({ sourceUrl: 'https://www.imorules.com/INTGRAIN.html', db: customDb });

    expect(governance.reportSyncStarted).toHaveBeenCalledWith(customDb, 'igc');
  });
});
