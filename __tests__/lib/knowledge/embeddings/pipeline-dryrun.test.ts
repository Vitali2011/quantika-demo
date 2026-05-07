/**
 * Tests for dryRun guard in embedAndStore pipeline (spec-14)
 *
 * Coverage: Input Contract boundary tests + Acceptance Criteria from spec-14
 * - TC-NBI-01: empty chunks → early return before dryRun (no log)
 * - TC-NBI-02: dryRun undefined → full pipeline
 * - TC-NBI-03: truncate guard fires before dryRun (RangeError priority)
 * - TC-NBI-04: truncate=true + dryRun=true → no error
 * - TC-NBI-05: nonexistent table + dryRun → no error (tableName only in log)
 * - TC-NBI-06: 300 chunks + dryRun → no error, logs count
 * - Structured JSON logging validation
 * - dryRun=false → embedDocuments called (existing behavior)
 */

import Database from 'better-sqlite3';
import sqliteVec from 'sqlite-vec';
import { embedAndStore } from '@/lib/knowledge/embeddings/pipeline';
import { embedDocuments } from '@/lib/knowledge/embeddings/client';
import type { Chunk } from '@/lib/knowledge/embeddings/chunks';

jest.mock('@/lib/knowledge/embeddings/client');
const mockEmbedDocuments = embedDocuments as jest.MockedFunction<typeof embedDocuments>;

describe('embedAndStore dryRun guard', () => {
  let db: Database.Database;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db);
    db.exec(`
      CREATE VIRTUAL TABLE imsbc_vec USING vec0(
        content TEXT,
        metadata TEXT,
        embedding FLOAT[768]
      );
    `);

    // Mock embedDocuments to return 768-dim zero vectors
    mockEmbedDocuments.mockResolvedValue([new Float32Array(768)]);

    // Spy on console.log to capture dry-run output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    db.close();
    jest.clearAllMocks();
    consoleLogSpy.mockRestore();
  });

  // TC-NBI-01: empty chunks → early return before dryRun (no log)
  test('TC-NBI-01: empty chunks array returns early before dryRun check', async () => {
    await embedAndStore([], { tableName: 'test_vec', dryRun: true, db });

    // Existing empty-array guard fires first → no log emitted
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });

  // TC-NBI-02: dryRun undefined → full pipeline
  test('TC-NBI-02: dryRun undefined defaults to false and executes full pipeline', async () => {
    const chunks: Chunk[] = [
      { content: 'test chunk', metadata: { source: 'test' } },
    ];

    await embedAndStore(chunks, { tableName: 'imsbc_vec', db });

    // dryRun=undefined → default false → embedDocuments called
    expect(mockEmbedDocuments).toHaveBeenCalledTimes(1);
    expect(mockEmbedDocuments).toHaveBeenCalledWith(['test chunk']);

    // Verify INSERT executed
    const row = db.prepare('SELECT COUNT(*) as count FROM imsbc_vec').get() as { count: number };
    expect(row.count).toBe(1);
  });

  // TC-NBI-03: truncate guard fires before dryRun (RangeError priority)
  test('TC-NBI-03: truncate guard fires before dryRun guard when chunk exceeds limit', async () => {
    const longContent = 'x'.repeat(3000);
    const chunks: Chunk[] = [
      { content: longContent, metadata: { source: 'test' } },
    ];

    // truncate=false + chunk >2048 chars + dryRun=true → RangeError
    await expect(
      embedAndStore(chunks, { tableName: 'test_vec', truncate: false, dryRun: true, db })
    ).rejects.toThrow(RangeError);

    // Cost guard takes priority → no log emitted, no API call
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });

  // TC-NBI-04: truncate=true + dryRun=true → no error
  test('TC-NBI-04: truncate=true + dryRun=true skips API call without error', async () => {
    const longContent = 'y'.repeat(3000);
    const chunks: Chunk[] = [
      { content: longContent, metadata: { source: 'test' } },
    ];

    await embedAndStore(chunks, { tableName: 'test_vec', truncate: true, dryRun: true, db });

    // Truncate guard passes, dryRun guard short-circuits
    expect(mockEmbedDocuments).not.toHaveBeenCalled();

    // Verify structured log emitted
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(loggedData.event).toBe('embedAndStore:dryRun');
    expect(loggedData.chunkCount).toBe(1);
    expect(loggedData.totalChars).toBe(3000);
    expect(loggedData.skipped).toBe(true);
  });

  // TC-NBI-05: nonexistent table + dryRun → no error (tableName only in log)
  test('TC-NBI-05: nonexistent table with dryRun does not trigger SQLite error', async () => {
    const chunks: Chunk[] = [
      { content: 'test', metadata: { source: 'test' } },
    ];

    // dryRun guard fires before any SQL → no table existence check
    await embedAndStore(chunks, { tableName: 'nonexistent_table', dryRun: true, db });

    expect(mockEmbedDocuments).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);

    const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(loggedData.tableName).toBe('nonexistent_table');
  });

  // TC-NBI-06: 300 chunks + dryRun → no error, logs count
  test('TC-NBI-06: large batch (300 chunks) with dryRun logs count without error', async () => {
    const chunks: Chunk[] = Array.from({ length: 300 }, (_, i) => ({
      content: `chunk ${i}`,
      metadata: { source: 'test', index: i },
    }));

    await embedAndStore(chunks, { tableName: 'test_vec', dryRun: true, db });

    // dryRun guard fires before batch loop → no API call
    expect(mockEmbedDocuments).not.toHaveBeenCalled();

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(loggedData.chunkCount).toBe(300);
  });

  // Structured JSON logging validation
  test('dryRun=true logs structured JSON with all required fields', async () => {
    const chunks: Chunk[] = [
      { content: 'chunk1', metadata: { source: 'test', id: 1 } },
      { content: 'chunk2', metadata: { source: 'test', id: 2 } },
    ];

    await embedAndStore(chunks, { tableName: 'test_vec', dryRun: true, db });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);

    expect(loggedData).toMatchObject({
      event: 'embedAndStore:dryRun',
      tableName: 'test_vec',
      chunkCount: 2,
      totalChars: 'chunk1'.length + 'chunk2'.length,
      skipped: true,
    });
  });

  // dryRun=false → embedDocuments called (existing behavior)
  test('dryRun=false executes embedDocuments and INSERT', async () => {
    const chunks: Chunk[] = [
      { content: 'test chunk', metadata: { source: 'test' } },
    ];

    await embedAndStore(chunks, { tableName: 'imsbc_vec', dryRun: false, db });

    // Full pipeline executes
    expect(mockEmbedDocuments).toHaveBeenCalledTimes(1);

    const row = db.prepare('SELECT COUNT(*) as count FROM imsbc_vec').get() as { count: number };
    expect(row.count).toBe(1);

    // No dry-run log emitted
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});
