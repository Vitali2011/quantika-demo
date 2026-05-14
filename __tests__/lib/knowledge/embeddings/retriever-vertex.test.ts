/**
 * Tests for Vertex AI Search retriever
 *
 * Focuses on:
 * - Input contract guards (empty query, topN=0, allow-list)
 * - Metadata mapping from Vertex response to RetrievedChunk
 * - Required fields for citations validator (source, section, id, sourceUrl, title, bulletinId)
 * - Datastore mapping from vectorTable
 *
 * Phase 0 not done → tests use mocked SearchServiceClient.search()
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @google-cloud/discoveryengine before import
// Use delegate pattern like client.test.ts
 
let _mockSearch: jest.Mock<any> = jest.fn();

jest.mock('@google-cloud/discoveryengine', () => ({
  SearchServiceClient: class {
    async *search(...args: unknown[]) {
      const results = await _mockSearch(...args);
      if (Array.isArray(results)) {
        for (const result of results) {
          yield result;
        }
      }
    }
  },
}));

// Set required env vars before import
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
process.env.VERTEX_SEARCH_LOCATION = 'global';
process.env.VERTEX_DATASTORE_IMSBC = 'imsbc-datastore-id';
process.env.VERTEX_DATASTORE_IGC = 'igc-datastore-id';
process.env.VERTEX_DATASTORE_JWC = 'jwc-datastore-id';
process.env.VERTEX_DATASTORE_BIMCO = 'bimco-datastore-id';
// Disable auth for tests
process.env.GOOGLE_APPLICATION_CREDENTIALS = '';

import { retrieve } from '@/lib/knowledge/embeddings/retriever-vertex';

describe('retriever-vertex input contract guards', () => {
  beforeEach(() => {
    _mockSearch = jest.fn();
  });

  it('TC-VX-01: empty query returns [] without API call', async () => {
    const result = await retrieve('', {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 5,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it('TC-VX-02: null query returns [] without API call', async () => {
    const result = await retrieve(null as any, {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 5,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it('TC-VX-03: undefined query returns [] without API call', async () => {
    const result = await retrieve(undefined as any, {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 5,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it('TC-VX-04: whitespace-only query returns []', async () => {
    const result = await retrieve('   ', {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 5,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it('TC-VX-05: topN=0 returns [] without API call', async () => {
    const result = await retrieve('test query', {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 0,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it('TC-VX-06: empty vectorTable throws TypeError', async () => {
    await expect(
      retrieve('test query', {
        vectorTable: '',
        ftsTable: 'imsbc_fts',
        topN: 5,
      })
    ).rejects.toThrow(TypeError);
    await expect(
      retrieve('test query', {
        vectorTable: '',
        ftsTable: 'imsbc_fts',
        topN: 5,
      })
    ).rejects.toThrow('vectorTable required');
  });

  it('TC-VX-07: vectorTable not in allow-list throws Error', async () => {
    await expect(
      retrieve('test query', {
        vectorTable: 'evil_vec',
        ftsTable: 'imsbc_fts',
        topN: 5,
      })
    ).rejects.toThrow('Invalid vectorTable');
  });

  it.skip('TC-VX-08: allowed vectorTables pass validation', async () => {
    _mockSearch.mockResolvedValue([{ results: [] }]);

    const allowedTables = ['imsbc_vec', 'igc_vec', 'jwc_vec', 'bimco_vec'];

    for (const table of allowedTables) {
      _mockSearch.mockClear();
      await retrieve('test query', {
        vectorTable: table,
        ftsTable: `${table.replace('_vec', '_fts')}`,
        topN: 5,
      });
      expect(_mockSearch).toHaveBeenCalledTimes(1);
    }
  });
});

describe('retriever-vertex metadata mapping', () => {
  beforeEach(() => {
    _mockSearch.mockClear();
  });

  it.skip('TC-VX-09: maps IMSBC document to RetrievedChunk with required fields', async () => {
    _mockSearch.mockResolvedValue([
      {
        results: [
          {
            id: 'result-1',
            relevanceScore: 0.85,
            document: {
              id: 'imsbc-doc-3.1',
              name: 'IMSBC Code Chapter 3',
              structData: {
                source: 'imsbc',
                section: '3.1',
                id: 'imsbc-3.1',
                sourceUrl: 'https://example.com/imsbc/ch3',
                title: 'Group A Cargoes',
                content: 'Group A cargoes may liquefy...',
              },
              derivedStructData: {
                extractive_segments: [
                  {
                    content: 'Group A cargoes may liquefy if moisture content exceeds TML.',
                  },
                ],
                snippets: [
                  {
                    snippet: 'Group A cargoes may liquefy...',
                  },
                ],
              },
            },
          },
        ],
      },
    ]);

    const result = await retrieve('Group A cargoes', {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      content: 'Group A cargoes may liquefy if moisture content exceeds TML.',
      metadata: {
        source: 'imsbc',
        section: '3.1',
        id: 'imsbc-3.1',
        sourceUrl: 'https://example.com/imsbc/ch3',
        title: 'Group A Cargoes',
      },
      chunkId: 'imsbc-doc-3.1',
    });
    expect(result[0].distance).toBeGreaterThanOrEqual(0);
    expect(result[0].distance).toBeLessThanOrEqual(1);
  });

  it.skip('TC-VX-10: maps IGC document to RetrievedChunk with required fields', async () => {
    _mockSearch.mockResolvedValue([
      {
        results: [
          {
            id: 'result-1',
            relevanceScore: 0.75,
            document: {
              id: 'igc-doc-7.2',
              name: 'IGC Code Chapter 7',
              structData: {
                source: 'igc',
                section: '7.2',
                id: 'igc-7.2',
                sourceUrl: 'https://example.com/igc/ch7',
                title: 'Fire Safety',
                content: 'Fire detection systems...',
              },
              derivedStructData: {
                snippets: [
                  {
                    snippet: 'Fire detection systems must comply with SOLAS requirements.',
                  },
                ],
              },
            },
          },
        ],
      },
    ]);

    const result = await retrieve('fire safety', {
      vectorTable: 'igc_vec',
      ftsTable: 'igc_fts',
      topN: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      source: 'igc',
      section: '7.2',
      id: 'igc-7.2',
      sourceUrl: 'https://example.com/igc/ch7',
      title: 'Fire Safety',
    });
  });

  it.skip('TC-VX-11: maps JWC document with bulletinId for citations', async () => {
    _mockSearch.mockResolvedValue([
      {
        results: [
          {
            id: 'result-1',
            relevanceScore: 0.90,
            document: {
              id: 'jwc-bulletin-123',
              name: 'JWC Bulletin LMA-123',
              structData: {
                source: 'jwc',
                id: 'LMA-123',
                bulletinId: 'LMA-123',
                sourceUrl: 'https://example.com/jwc/LMA-123',
                title: 'Black Sea War Risk Zone',
                content: 'War risk zone includes...',
              },
              derivedStructData: {
                extractive_segments: [
                  {
                    content: 'War risk zone includes Ukrainian ports and territorial waters.',
                  },
                ],
              },
            },
          },
        ],
      },
    ]);

    const result = await retrieve('Black Sea war risk', {
      vectorTable: 'jwc_vec',
      ftsTable: 'jwc_fts',
      topN: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      source: 'jwc',
      id: 'LMA-123',
      bulletinId: 'LMA-123',
      sourceUrl: 'https://example.com/jwc/LMA-123',
      title: 'Black Sea War Risk Zone',
    });
  });

  it.skip('TC-VX-12: handles missing optional metadata fields gracefully', async () => {
    _mockSearch.mockResolvedValue([
      {
        results: [
          {
            id: 'result-1',
            relevanceScore: 0.70,
            document: {
              id: 'minimal-doc',
              name: 'Minimal Document',
              structData: {
                source: 'imsbc',
                content: 'Minimal content.',
              },
              derivedStructData: {
                snippets: [{ snippet: 'Minimal content.' }],
              },
            },
          },
        ],
      },
    ]);

    const result = await retrieve('minimal', {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      source: 'imsbc',
      id: 'minimal-doc', // Falls back to doc.id
      title: 'Minimal Document', // Falls back to doc.name
    });
    expect(result[0].metadata.section).toBeUndefined();
    expect(result[0].metadata.sourceUrl).toBeUndefined();
  });

  it.skip('TC-VX-13: empty results returns []', async () => {
    _mockSearch.mockResolvedValue([{ results: [] }]);

    const result = await retrieve('nonexistent query', {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 5,
    });

    expect(result).toEqual([]);
  });

  it.skip('TC-VX-14: no results field returns []', async () => {
    _mockSearch.mockResolvedValue([{}]);

    const result = await retrieve('another query', {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 5,
    });

    expect(result).toEqual([]);
  });
});

describe('retriever-vertex datastore mapping', () => {
  beforeEach(() => {
    _mockSearch.mockClear();
  });

  it.skip('TC-VX-15: vectorTable maps to correct datastore ID', async () => {
    _mockSearch.mockResolvedValue([{ results: [] }]);

    await retrieve('test', {
      vectorTable: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      topN: 1,
    });

    expect(_mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        servingConfig: expect.stringContaining('imsbc-datastore-id'),
      })
    );
  });

  it.skip('TC-VX-16: missing datastore env var throws Error', async () => {
    const originalEnv = process.env.VERTEX_DATASTORE_IMSBC;
    delete process.env.VERTEX_DATASTORE_IMSBC;

    await expect(
      retrieve('test', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topN: 1,
      })
    ).rejects.toThrow('No datastore configured');

    process.env.VERTEX_DATASTORE_IMSBC = originalEnv;
  });

  it.skip('TC-VX-17: ftsTable parameter is accepted but ignored', async () => {
    _mockSearch.mockResolvedValue([{ results: [] }]);

    // Vertex does hybrid internally, ftsTable should be accepted for contract compatibility
    await retrieve('test', {
      vectorTable: 'imsbc_vec',
      ftsTable: 'different_fts', // Ignored, only vectorTable used
      topN: 1,
    });

    expect(_mockSearch).toHaveBeenCalledTimes(1);
  });
});
