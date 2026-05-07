/**
 * RRF merge algorithm tests
 * Spec: spec-09-rrf-merge-score-doc-1-rrfk-rank-i-for-each-ranking-list-documents-in-both-lists-accumulate-from-both-terms
 *
 * Tests the Reciprocal Rank Fusion (RRF) merge scoring algorithm:
 * score(doc) = Σ_r 1 / (k + rank_r(doc))
 *
 * Input Contract Coverage:
 * - TC-NBI-01: Empty ftsResults
 * - TC-NBI-02: Empty vecResults
 * - TC-NBI-03: Negative rrfK
 * - TC-NBI-04: rrfK=0
 * - TC-NBI-05: topN=0
 * - TC-NBI-06: Invalid JSON metadata
 */

import { rrfMerge, type RankedDoc, type RrfMergeOptions } from '@/lib/knowledge/embeddings/retriever';
import type { RetrievedChunk } from '@/lib/knowledge/embeddings/chunks';

describe('rrfMerge - Boundary Tests', () => {
  describe('TC-NBI-01: Empty ftsResults', () => {
    it('should compute scores from vecResults only when ftsResults is empty', () => {
      const ftsResults: RankedDoc[] = [];
      const vecResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: '{"source":"test"}', rank: 1 },
        { rowid: 2, content: 'Another doc', metadata: '{"source":"test"}', rank: 2 },
      ];

      const result = rrfMerge(ftsResults, vecResults);

      expect(result).toHaveLength(2);
      // Score from vec0 only: 1/(60+1) = 0.016393
      expect(result[0].distance).toBeCloseTo(0.016393, 6);
      expect(result[0].chunkId).toBe('1');
      // Score from vec0 only: 1/(60+2) = 0.016129
      expect(result[1].distance).toBeCloseTo(0.016129, 6);
      expect(result[1].chunkId).toBe('2');
    });

    it('should return empty array when both ftsResults and vecResults are empty', () => {
      const result = rrfMerge([], []);
      expect(result).toEqual([]);
    });
  });

  describe('TC-NBI-02: Empty vecResults', () => {
    it('should compute scores from ftsResults only when vecResults is empty', () => {
      const ftsResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: '{"source":"test"}', rank: 1 },
        { rowid: 2, content: 'Another doc', metadata: '{"source":"test"}', rank: 2 },
      ];
      const vecResults: RankedDoc[] = [];

      const result = rrfMerge(ftsResults, vecResults);

      expect(result).toHaveLength(2);
      // Score from fts5 only: 1/(60+1) = 0.016393
      expect(result[0].distance).toBeCloseTo(0.016393, 6);
      expect(result[0].chunkId).toBe('1');
      // Score from fts5 only: 1/(60+2) = 0.016129
      expect(result[1].distance).toBeCloseTo(0.016129, 6);
      expect(result[1].chunkId).toBe('2');
    });
  });

  describe('TC-NBI-03: Negative rrfK', () => {
    it('should clamp negative rrfK to 1 (minimum valid)', () => {
      const ftsResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: '{"source":"test"}', rank: 1 },
      ];
      const vecResults: RankedDoc[] = [];

      const result = rrfMerge(ftsResults, vecResults, { rrfK: -5 });

      expect(result).toHaveLength(1);
      // With rrfK=1: 1/(1+1) = 0.5
      expect(result[0].distance).toBeCloseTo(0.5, 6);
    });

    it('should clamp NaN rrfK to default 60', () => {
      const ftsResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: '{"source":"test"}', rank: 1 },
      ];
      const vecResults: RankedDoc[] = [];

      const result = rrfMerge(ftsResults, vecResults, { rrfK: NaN });

      expect(result).toHaveLength(1);
      // With rrfK=60: 1/(60+1) = 0.016393
      expect(result[0].distance).toBeCloseTo(0.016393, 6);
    });

    it('should clamp Infinity rrfK to default 60', () => {
      const ftsResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: '{"source":"test"}', rank: 1 },
      ];
      const vecResults: RankedDoc[] = [];

      const result = rrfMerge(ftsResults, vecResults, { rrfK: Infinity });

      expect(result).toHaveLength(1);
      // With rrfK=60: 1/(60+1) = 0.016393
      expect(result[0].distance).toBeCloseTo(0.016393, 6);
    });
  });

  describe('TC-NBI-04: rrfK=0', () => {
    it('should clamp rrfK=0 to 1 (minimum valid)', () => {
      const ftsResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: '{"source":"test"}', rank: 1 },
      ];
      const vecResults: RankedDoc[] = [];

      const result = rrfMerge(ftsResults, vecResults, { rrfK: 0 });

      expect(result).toHaveLength(1);
      // With rrfK=1: 1/(1+1) = 0.5
      expect(result[0].distance).toBeCloseTo(0.5, 6);
    });
  });

  describe('TC-NBI-05: topN=0', () => {
    it('should return empty array when topN=0', () => {
      const ftsResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: '{"source":"test"}', rank: 1 },
      ];
      const vecResults: RankedDoc[] = [];

      const result = rrfMerge(ftsResults, vecResults, { topN: 0 });

      expect(result).toEqual([]);
    });

    it('should clamp negative topN to 0 and return empty array', () => {
      const ftsResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: '{"source":"test"}', rank: 1 },
      ];
      const vecResults: RankedDoc[] = [];

      const result = rrfMerge(ftsResults, vecResults, { topN: -5 });

      expect(result).toEqual([]);
    });
  });

  describe('TC-NBI-06: Invalid JSON metadata', () => {
    it('should not crash on invalid JSON metadata and preserve it', () => {
      const ftsResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: 'not{json', rank: 1 },
      ];
      const vecResults: RankedDoc[] = [];

      const result = rrfMerge(ftsResults, vecResults);

      expect(result).toHaveLength(1);
      expect(result[0].chunkId).toBe('1');
      // Metadata should be preserved in some form (not crash)
      expect(result[0].metadata).toBeDefined();
    });

    it('should handle empty string metadata', () => {
      const ftsResults: RankedDoc[] = [
        { rowid: 1, content: 'Test doc', metadata: '', rank: 1 },
      ];
      const vecResults: RankedDoc[] = [];

      const result = rrfMerge(ftsResults, vecResults);

      expect(result).toHaveLength(1);
      expect(result[0].metadata).toBeDefined();
    });
  });
});

describe('rrfMerge - Score Accumulation', () => {
  it('should accumulate scores from both FTS5 and vec0 lists (dual-list document)', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Dual doc', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [
      { rowid: 1, content: 'Dual doc', metadata: '{"source":"test"}', rank: 1 },
    ];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(1);
    // Score from both lists: 2 × 1/(60+1) = 0.032787
    expect(result[0].distance).toBeCloseTo(0.032787, 6);
    expect(result[0].chunkId).toBe('1');
  });

  it('should compute single-list scores correctly', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'FTS only doc', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [
      { rowid: 2, content: 'Vec only doc', metadata: '{"source":"test"}', rank: 3 },
    ];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(2);
    // FTS only at rank 1: 1/(60+1) = 0.016393
    expect(result[0].distance).toBeCloseTo(0.016393, 6);
    expect(result[0].chunkId).toBe('1');
    // Vec only at rank 3: 1/(60+3) = 0.015873
    expect(result[1].distance).toBeCloseTo(0.015873, 6);
    expect(result[1].chunkId).toBe('2');
  });

  it('should have dual-list document score higher than single-list documents', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Dual doc', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 2, content: 'FTS only doc', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [
      { rowid: 1, content: 'Dual doc', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 3, content: 'Vec only doc', metadata: '{"source":"test"}', rank: 1 },
    ];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(3);
    // First result should be the dual-list document
    expect(result[0].chunkId).toBe('1');
    // Dual-list score: 2 × 1/(60+1) = 0.032787
    expect(result[0].distance).toBeCloseTo(0.032787, 6);
    // Single-list scores: 1/(60+1) = 0.016393 (tied, broken by rowid)
    expect(result[1].distance).toBeCloseTo(0.016393, 6);
    expect(result[2].distance).toBeCloseTo(0.016393, 6);
  });

  it('should accumulate different ranks from both lists correctly', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Doc', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [
      { rowid: 1, content: 'Doc', metadata: '{"source":"test"}', rank: 20 },
    ];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(1);
    // Score: 1/(60+1) + 1/(60+20) = 0.016393 + 0.0125 = 0.028893
    expect(result[0].distance).toBeCloseTo(0.028893, 6);
  });
});

describe('rrfMerge - Ranking Correctness', () => {
  it('should rank lower positions higher within single-list documents', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Rank 1', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 2, content: 'Rank 5', metadata: '{"source":"test"}', rank: 5 },
      { rowid: 3, content: 'Rank 10', metadata: '{"source":"test"}', rank: 10 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(3);
    // Rank 1: 1/(60+1) = 0.016393
    expect(result[0].chunkId).toBe('1');
    expect(result[0].distance).toBeCloseTo(0.016393, 6);
    // Rank 5: 1/(60+5) = 0.015385
    expect(result[1].chunkId).toBe('2');
    expect(result[1].distance).toBeCloseTo(0.015385, 6);
    // Rank 10: 1/(60+10) = 0.014286
    expect(result[2].chunkId).toBe('3');
    expect(result[2].distance).toBeCloseTo(0.014286, 6);
  });

  it('should verify dual-list doc at rank 20 scores higher than single-list at rank 1 (RRF promotion)', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Dual at rank 20', metadata: '{"source":"test"}', rank: 20 },
      { rowid: 2, content: 'Single at rank 1', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [
      { rowid: 1, content: 'Dual at rank 20', metadata: '{"source":"test"}', rank: 20 },
    ];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(2);
    // Dual at rank 20 both lists: 2 × 1/(60+20) = 2 × 0.0125 = 0.025
    expect(result[0].chunkId).toBe('1');
    expect(result[0].distance).toBeCloseTo(0.025, 6);
    // Single at rank 1: 1/(60+1) = 0.016393
    expect(result[1].chunkId).toBe('2');
    expect(result[1].distance).toBeCloseTo(0.016393, 6);
  });
});

describe('rrfMerge - rrfK Parameter Effect', () => {
  it('should show stronger rank influence with rrfK=1 (steep)', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Rank 1', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 2, content: 'Rank 20', metadata: '{"source":"test"}', rank: 20 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults, { rrfK: 1 });

    expect(result).toHaveLength(2);
    // Rank 1 with k=1: 1/(1+1) = 0.5
    expect(result[0].distance).toBeCloseTo(0.5, 6);
    // Rank 20 with k=1: 1/(1+20) = 0.047619
    expect(result[1].distance).toBeCloseTo(0.047619, 6);
    // Steep dropoff: 0.5 / 0.047619 ≈ 10.5
  });

  it('should show weaker rank influence with rrfK=1000 (flat)', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Rank 1', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 2, content: 'Rank 20', metadata: '{"source":"test"}', rank: 20 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults, { rrfK: 1000 });

    expect(result).toHaveLength(2);
    // Rank 1 with k=1000: 1/(1000+1) = 0.000999
    expect(result[0].distance).toBeCloseTo(0.000999, 6);
    // Rank 20 with k=1000: 1/(1000+20) = 0.000980
    expect(result[1].distance).toBeCloseTo(0.000980, 6);
    // Nearly flat: 0.000999 / 0.000980 ≈ 1.02
  });

  it('should use default rrfK=60 when not specified', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Test', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(1);
    // With default k=60: 1/(60+1) = 0.016393
    expect(result[0].distance).toBeCloseTo(0.016393, 6);
  });
});

describe('rrfMerge - topN Limiting', () => {
  it('should limit to topN=3 when more candidates exist', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Doc 1', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 2, content: 'Doc 2', metadata: '{"source":"test"}', rank: 2 },
      { rowid: 3, content: 'Doc 3', metadata: '{"source":"test"}', rank: 3 },
      { rowid: 4, content: 'Doc 4', metadata: '{"source":"test"}', rank: 4 },
      { rowid: 5, content: 'Doc 5', metadata: '{"source":"test"}', rank: 5 },
      { rowid: 6, content: 'Doc 6', metadata: '{"source":"test"}', rank: 6 },
      { rowid: 7, content: 'Doc 7', metadata: '{"source":"test"}', rank: 7 },
      { rowid: 8, content: 'Doc 8', metadata: '{"source":"test"}', rank: 8 },
      { rowid: 9, content: 'Doc 9', metadata: '{"source":"test"}', rank: 9 },
      { rowid: 10, content: 'Doc 10', metadata: '{"source":"test"}', rank: 10 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults, { topN: 3 });

    expect(result).toHaveLength(3);
    expect(result[0].chunkId).toBe('1');
    expect(result[1].chunkId).toBe('2');
    expect(result[2].chunkId).toBe('3');
  });

  it('should return all candidates when fewer than topN exist', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Doc 1', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 2, content: 'Doc 2', metadata: '{"source":"test"}', rank: 2 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults, { topN: 5 });

    expect(result).toHaveLength(2);
  });

  it('should use default topN=5 when not specified', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Doc 1', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 2, content: 'Doc 2', metadata: '{"source":"test"}', rank: 2 },
      { rowid: 3, content: 'Doc 3', metadata: '{"source":"test"}', rank: 3 },
      { rowid: 4, content: 'Doc 4', metadata: '{"source":"test"}', rank: 4 },
      { rowid: 5, content: 'Doc 5', metadata: '{"source":"test"}', rank: 5 },
      { rowid: 6, content: 'Doc 6', metadata: '{"source":"test"}', rank: 6 },
      { rowid: 7, content: 'Doc 7', metadata: '{"source":"test"}', rank: 7 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(5);
  });
});

describe('rrfMerge - Tie-Breaking', () => {
  it('should break ties by lower rowid when scores are identical', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 5, content: 'Doc 5', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 2, content: 'Doc 2', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 10, content: 'Doc 10', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 1, content: 'Doc 1', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(4);
    // All have same score 1/(60+1) = 0.016393, sorted by rowid
    expect(result[0].chunkId).toBe('1');
    expect(result[1].chunkId).toBe('2');
    expect(result[2].chunkId).toBe('5');
    expect(result[3].chunkId).toBe('10');

    // Verify all have same score
    result.forEach((doc) => {
      expect(doc.distance).toBeCloseTo(0.016393, 6);
    });
  });

  it('should be deterministic with mixed scores and ties', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 3, content: 'Doc 3', metadata: '{"source":"test"}', rank: 2 },
      { rowid: 1, content: 'Doc 1', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 4, content: 'Doc 4', metadata: '{"source":"test"}', rank: 2 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(3);
    // Rank 1: higher score
    expect(result[0].chunkId).toBe('1');
    // Rank 2 (tied): rowid 3 < 4
    expect(result[1].chunkId).toBe('3');
    expect(result[2].chunkId).toBe('4');
  });
});

describe('rrfMerge - Score Precision', () => {
  it('should calculate scores to 6 decimal places precision', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Doc', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [
      { rowid: 1, content: 'Doc', metadata: '{"source":"test"}', rank: 1 },
    ];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(1);
    // Expected: 2 × 1/(60+1) = 2/61 = 0.032786885245901636...
    const expectedScore = 2 / 61;
    expect(result[0].distance).toBeCloseTo(expectedScore, 6);
  });

  it('should verify all RRF scores are within valid range (0.0, 0.0333) for default k=60', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Dual rank 1', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 2, content: 'Single rank 1', metadata: '{"source":"test"}', rank: 1 },
      { rowid: 3, content: 'Single rank 100', metadata: '{"source":"test"}', rank: 100 },
    ];
    const vecResults: RankedDoc[] = [
      { rowid: 1, content: 'Dual rank 1', metadata: '{"source":"test"}', rank: 1 },
    ];

    const result = rrfMerge(ftsResults, vecResults);

    result.forEach((doc) => {
      expect(doc.distance).toBeGreaterThan(0.0);
      expect(doc.distance).toBeLessThanOrEqual(0.0333);
    });
  });
});

describe('rrfMerge - Metadata Parsing', () => {
  it('should correctly parse valid JSON metadata to object', () => {
    const ftsResults: RankedDoc[] = [
      {
        rowid: 1,
        content: 'Test doc',
        metadata: '{"source":"imsbc","section":"Chapter 3.1","title":"Test"}',
        rank: 1
      },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toEqual({
      source: 'imsbc',
      section: 'Chapter 3.1',
      title: 'Test',
    });
  });

  it('should preserve raw metadata when JSON parsing fails', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Test doc', metadata: 'not valid {json}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(1);
    // Should not crash and should have some metadata representation
    expect(result[0].metadata).toBeDefined();
  });
});

describe('rrfMerge - Return Type', () => {
  it('should return RetrievedChunk[] with all required fields', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Test content', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(1);
    const chunk = result[0];

    // RetrievedChunk extends Chunk
    expect(chunk).toHaveProperty('content');
    expect(chunk).toHaveProperty('metadata');
    expect(chunk).toHaveProperty('distance');
    expect(chunk).toHaveProperty('chunkId');

    // Verify types
    expect(typeof chunk.content).toBe('string');
    expect(typeof chunk.metadata).toBe('object');
    expect(typeof chunk.distance).toBe('number');
    expect(typeof chunk.chunkId).toBe('string');
  });

  it('should use RRF score as the distance field', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 1, content: 'Test', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(1);
    // distance field should contain the RRF score
    expect(result[0].distance).toBeCloseTo(0.016393, 6);
  });

  it('should convert rowid to string for chunkId', () => {
    const ftsResults: RankedDoc[] = [
      { rowid: 42, content: 'Test', metadata: '{"source":"test"}', rank: 1 },
    ];
    const vecResults: RankedDoc[] = [];

    const result = rrfMerge(ftsResults, vecResults);

    expect(result).toHaveLength(1);
    expect(result[0].chunkId).toBe('42');
    expect(typeof result[0].chunkId).toBe('string');
  });
});
