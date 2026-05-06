/**
 * Tests for IMSBC adapter — governance lifecycle integration
 *
 * Input contract tests:
 * - TC-NBI-01: empty sourceUrl → throws before reportSyncStarted
 * - TC-NBI-02: undefined sourceUrl (env unset) → throws before reportSyncStarted
 * - TC-NBI-04: zero sections → graceful handling, reportSyncSuccess with rowsChanged: 0
 * - TC-NBI-06: dryRun=true → embedAndStore NOT called, reportSyncSuccess with dryRun metadata
 */

import { syncImsbc } from '@/lib/knowledge/sources/imsbc/adapter';
import * as governance from '@/lib/knowledge/governance';
import * as pipeline from '@/lib/knowledge/embeddings/pipeline';
import * as scraper from '@/lib/knowledge/sources/imsbc/scraper';
import * as chunker from '@/lib/knowledge/sources/imsbc/chunker';
import Database from 'better-sqlite3';

// Mock dependencies
jest.mock('@/lib/knowledge/governance');
jest.mock('@/lib/knowledge/embeddings/pipeline');
jest.mock('@/lib/knowledge/sources/imsbc/scraper');
jest.mock('@/lib/knowledge/sources/imsbc/chunker');
jest.mock('@/lib/db', () => ({
  getDb: jest.fn(() => ({} as Database.Database)),
}));

describe('IMSBC adapter — syncImsbc()', () => {
  const mockDb = {} as Database.Database;
  let originalEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env.IMSBC_SOURCE_URL;

    // Default mocks for happy path
    (governance.reportSyncStarted as jest.Mock).mockReturnValue(123);
    (governance.reportSyncSuccess as jest.Mock).mockReturnValue(undefined);
    (governance.reportSyncFailure as jest.Mock).mockReturnValue(undefined);
    (pipeline.embedAndStore as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.IMSBC_SOURCE_URL;
    } else {
      process.env.IMSBC_SOURCE_URL = originalEnv;
    }
  });

  /**
   * TC-NBI-02: undefined sourceUrl (env unset) → throws before reportSyncStarted
   */
  test('TC-NBI-02: missing sourceUrl (env unset) throws before reportSyncStarted', async () => {
    delete process.env.IMSBC_SOURCE_URL;

    await expect(syncImsbc({ db: mockDb })).rejects.toThrow('IMSBC_SOURCE_URL is required');

    // Verify reportSyncStarted was NOT called
    expect(governance.reportSyncStarted).not.toHaveBeenCalled();
  });

  /**
   * TC-NBI-01: empty sourceUrl → throws before reportSyncStarted
   */
  test('TC-NBI-01: empty sourceUrl throws before reportSyncStarted', async () => {
    await expect(syncImsbc({ db: mockDb, sourceUrl: '' })).rejects.toThrow('IMSBC_SOURCE_URL is required');

    // Verify reportSyncStarted was NOT called
    expect(governance.reportSyncStarted).not.toHaveBeenCalled();
  });

  /**
   * Happy path: scrape → chunk → embed → success lifecycle
   */
  test('happy path: scrape → chunk → embed → success lifecycle', async () => {
    const mockSections = [
      { title: 'Section 1', content: 'Content 1' },
      { title: 'Section 2', content: 'Content 2' },
      { title: 'Section 3', content: 'Content 3' },
    ];
    const mockChunks = Array.from({ length: 10 }, (_, i) => ({
      content: `Chunk ${i}`,
      metadata: { section: i % 3 },
    }));

    (scraper.scrapeImsbc as jest.Mock).mockResolvedValue(mockSections);
    (chunker.chunkImsbc as jest.Mock).mockReturnValue(mockChunks);

    const result = await syncImsbc({ db: mockDb, sourceUrl: 'https://example.com/imsbc' });

    // Verify governance lifecycle
    expect(governance.reportSyncStarted).toHaveBeenCalledWith(mockDb, 'imsbc');
    expect(governance.reportSyncStarted).toHaveBeenCalledTimes(1);

    // Verify scraper called
    expect(scraper.scrapeImsbc).toHaveBeenCalledWith('https://example.com/imsbc');

    // Verify chunker called
    expect(chunker.chunkImsbc).toHaveBeenCalledWith(mockSections);

    // Verify embedAndStore called
    expect(pipeline.embedAndStore).toHaveBeenCalledWith(mockChunks, {
      tableName: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      truncate: true,
      db: mockDb,
    });

    // Verify success reporting
    expect(governance.reportSyncSuccess).toHaveBeenCalledWith(mockDb, 123, {
      rowsChanged: 10,
      upstreamVersion: 'https://example.com/imsbc',
      metadata: { sectionsScraped: 3 },
    });

    // Verify result
    expect(result).toEqual({
      syncLogId: 123,
      chunksProcessed: 10,
      sectionsScraped: 3,
      dryRun: false,
    });

    // Verify reportSyncFailure was NOT called
    expect(governance.reportSyncFailure).not.toHaveBeenCalled();
  });

  /**
   * TC-NBI-06: dryRun=true → embedAndStore NOT called, reportSyncSuccess with dryRun metadata
   */
  test('TC-NBI-06: dry run mode — embedAndStore NOT called, success with dryRun metadata', async () => {
    const mockSections = [{ title: 'Section 1', content: 'Content 1' }];
    const mockChunks = [
      { content: 'Chunk 1', metadata: {} },
      { content: 'Chunk 2', metadata: {} },
    ];

    (scraper.scrapeImsbc as jest.Mock).mockResolvedValue(mockSections);
    (chunker.chunkImsbc as jest.Mock).mockReturnValue(mockChunks);

    const result = await syncImsbc({ db: mockDb, sourceUrl: 'https://example.com/imsbc', dryRun: true });

    // Verify scraper and chunker called
    expect(scraper.scrapeImsbc).toHaveBeenCalled();
    expect(chunker.chunkImsbc).toHaveBeenCalled();

    // Verify embedAndStore was NOT called
    expect(pipeline.embedAndStore).not.toHaveBeenCalled();

    // Verify success reporting with dryRun metadata
    expect(governance.reportSyncSuccess).toHaveBeenCalledWith(mockDb, 123, {
      rowsChanged: 0,
      metadata: { dryRun: true, chunkCount: 2 },
    });

    // Verify result
    expect(result).toEqual({
      syncLogId: 123,
      chunksProcessed: 2,
      sectionsScraped: 1,
      dryRun: true,
    });
  });

  /**
   * Scraper failure → reportSyncFailure + re-throw
   */
  test('scraper failure → reportSyncFailure + re-throw', async () => {
    const scraperError = new Error('Network timeout');
    (scraper.scrapeImsbc as jest.Mock).mockRejectedValue(scraperError);

    await expect(syncImsbc({ db: mockDb, sourceUrl: 'https://example.com/imsbc' })).rejects.toThrow('Network timeout');

    // Verify reportSyncStarted was called
    expect(governance.reportSyncStarted).toHaveBeenCalledWith(mockDb, 'imsbc');

    // Verify reportSyncFailure was called
    expect(governance.reportSyncFailure).toHaveBeenCalledWith(mockDb, 123, scraperError);

    // Verify reportSyncSuccess was NOT called
    expect(governance.reportSyncSuccess).not.toHaveBeenCalled();

    // Verify embedAndStore was NOT called
    expect(pipeline.embedAndStore).not.toHaveBeenCalled();
  });

  /**
   * Embed failure → reportSyncFailure + re-throw
   */
  test('embed failure → reportSyncFailure + re-throw', async () => {
    const embedError = new Error('Vertex API quota exceeded');
    const mockSections = [{ title: 'Section 1', content: 'Content 1' }];
    const mockChunks = [{ content: 'Chunk 1', metadata: {} }];

    (scraper.scrapeImsbc as jest.Mock).mockResolvedValue(mockSections);
    (chunker.chunkImsbc as jest.Mock).mockReturnValue(mockChunks);
    (pipeline.embedAndStore as jest.Mock).mockRejectedValue(embedError);

    await expect(syncImsbc({ db: mockDb, sourceUrl: 'https://example.com/imsbc' })).rejects.toThrow('Vertex API quota exceeded');

    // Verify reportSyncFailure was called
    expect(governance.reportSyncFailure).toHaveBeenCalledWith(mockDb, 123, embedError);

    // Verify reportSyncSuccess was NOT called
    expect(governance.reportSyncSuccess).not.toHaveBeenCalled();
  });

  /**
   * TC-NBI-04: zero sections → graceful handling, reportSyncSuccess with rowsChanged: 0
   */
  test('TC-NBI-04: zero sections → embedAndStore with 0 chunks, reportSyncSuccess rowsChanged: 0', async () => {
    (scraper.scrapeImsbc as jest.Mock).mockResolvedValue([]);
    (chunker.chunkImsbc as jest.Mock).mockReturnValue([]);

    const result = await syncImsbc({ db: mockDb, sourceUrl: 'https://example.com/imsbc' });

    // Verify embedAndStore called with empty array
    expect(pipeline.embedAndStore).toHaveBeenCalledWith([], {
      tableName: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      truncate: true,
      db: mockDb,
    });

    // Verify success reporting with rowsChanged: 0
    expect(governance.reportSyncSuccess).toHaveBeenCalledWith(mockDb, 123, {
      rowsChanged: 0,
      upstreamVersion: 'https://example.com/imsbc',
      metadata: { sectionsScraped: 0 },
    });

    expect(result).toEqual({
      syncLogId: 123,
      chunksProcessed: 0,
      sectionsScraped: 0,
      dryRun: false,
    });
  });

  /**
   * Idempotency: second sync aborts first via governance KG-2
   */
  test('idempotency: second sync aborts first via governance KG-2', async () => {
    const mockSections = [{ title: 'Section 1', content: 'Content 1' }];
    const mockChunks = [{ content: 'Chunk 1', metadata: {} }];

    (scraper.scrapeImsbc as jest.Mock).mockResolvedValue(mockSections);
    (chunker.chunkImsbc as jest.Mock).mockReturnValue(mockChunks);

    // Mock reportSyncStarted to return different IDs for successive calls
    (governance.reportSyncStarted as jest.Mock)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(101);

    // First sync
    const result1 = await syncImsbc({ db: mockDb, sourceUrl: 'https://example.com/imsbc' });
    expect(result1.syncLogId).toBe(100);

    // Second sync (should abort first via governance.reportSyncStarted)
    const result2 = await syncImsbc({ db: mockDb, sourceUrl: 'https://example.com/imsbc' });
    expect(result2.syncLogId).toBe(101);

    // Verify reportSyncStarted was called twice
    expect(governance.reportSyncStarted).toHaveBeenCalledTimes(2);
    expect(governance.reportSyncStarted).toHaveBeenNthCalledWith(1, mockDb, 'imsbc');
    expect(governance.reportSyncStarted).toHaveBeenNthCalledWith(2, mockDb, 'imsbc');

    // Verify reportSyncSuccess was called twice (once for each sync)
    expect(governance.reportSyncSuccess).toHaveBeenCalledTimes(2);
    expect(governance.reportSyncSuccess).toHaveBeenNthCalledWith(1, mockDb, 100, expect.any(Object));
    expect(governance.reportSyncSuccess).toHaveBeenNthCalledWith(2, mockDb, 101, expect.any(Object));
  });
});
