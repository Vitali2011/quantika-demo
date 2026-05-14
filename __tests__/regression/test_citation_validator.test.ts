/**
 * Regression tests: F-4 (dot-anchored section match) + F-5 (case-insensitive regex)
 * Discovery: adversarial QA cold-start, 2026-05-07
 * Branch: fix/rag-phase2-post-qa-fixes
 *
 * DO NOT DELETE — these tests lock in two citation validator bug fixes.
 *
 * ── F-4: substring section match allows hallucinations ─────────────────────
 * section.includes(sectionRef) is true for sectionRef='1', section='21.5'
 * because '21.5'.includes('1') === true. §1 validates against a §21.5 chunk
 * → hallucinated citation passes through the filter.
 * Fix: dot-anchored prefix match — §1 matches §1.x but not §21.x.
 *
 * ── F-5: case-sensitive CITATION_PATTERN misses mixed-case tags ────────────
 * [Source: imsbc §1.1] does not match /IMSBC|IGC/ without the `i` flag.
 * The tag is preserved as-is rather than being checked against retrieved chunks
 * → a hallucinated lowercase citation is never stripped.
 * Fix: add `i` flag to CITATION_PATTERN.
 */

import { describe, it, expect } from '@jest/globals';
import { validateCitations } from '@/lib/knowledge/citations/validator';
import type { RetrievedChunk } from '@/lib/knowledge/embeddings/chunks';

function makeChunk(source: string, section: string): RetrievedChunk {
  return {
    content: 'chunk content',
    metadata: { source, section },
    distance: 0.1,
    chunkId: 'test-id',
  };
}

// ─── F-4: dot-anchored section match ────────────────────────────────────────

describe('F-4 regression: citation validator dot-anchored section match', () => {
  it('F-4-a: §1 against chunk section=21.5 → citation REMOVED (was false positive)', () => {
    // Old code: '21.5'.includes('1') === true → citation kept (BUG)
    // Fixed:    '21.5' !== '1' and !startsWith('1.') and !('1'.startsWith('21.5.')) → removed
    const chunk = makeChunk('imsbc', '21.5');
    const result = validateCitations('[Source: IMSBC §1] some text', [chunk]);
    expect(result).toBe(' some text');
  });

  it('F-4-b: §2 against chunk section=2.1 → citation KEPT (legitimate sub-section)', () => {
    // §2 is a valid parent of §2.1 — citation should survive
    const chunk = makeChunk('imsbc', '2.1');
    const result = validateCitations('[Source: IMSBC §2] some text', [chunk]);
    expect(result).toBe('[Source: IMSBC §2] some text');
  });

  it('F-4-c: §21 against chunk section=21.5 → citation KEPT (prefix match)', () => {
    // §21.5 starts with '21.' → §21 is the parent section
    const chunk = makeChunk('imsbc', '21.5');
    const result = validateCitations('[Source: IMSBC §21] some text', [chunk]);
    expect(result).toBe('[Source: IMSBC §21] some text');
  });

  it('F-4-d: exact section match → citation KEPT', () => {
    const chunk = makeChunk('imsbc', '3.1');
    const result = validateCitations('[Source: IMSBC §3.1] text', [chunk]);
    expect(result).toBe('[Source: IMSBC §3.1] text');
  });

  it('F-4-e: §3 against chunk section=13.1 → citation REMOVED', () => {
    // '13.1'.startsWith('3.') === false, '3'.startsWith('13.1.') === false → removed
    const chunk = makeChunk('imsbc', '13.1');
    const result = validateCitations('[Source: IMSBC §3] text', [chunk]);
    expect(result).toBe(' text');
  });
});

// ─── F-5: case-insensitive CITATION_PATTERN ──────────────────────────────────

describe('F-5 regression: citation validator case-insensitive pattern', () => {
  it('F-5-a: lowercase [Source: imsbc §1.1] against empty chunks → citation REMOVED', () => {
    // Without `i` flag the pattern never matches 'imsbc' → tag preserved (BUG)
    const result = validateCitations('[Source: imsbc §1.1] text', []);
    expect(result).toBe(' text');
  });

  it('F-5-b: uppercase [Source: IMSBC §1.1] against empty chunks → citation REMOVED', () => {
    // Baseline: already worked before the fix
    const result = validateCitations('[Source: IMSBC §1.1] text', []);
    expect(result).toBe(' text');
  });

  it('F-5-c: mixed case [Source: Imsbc §1.1] against empty chunks → citation REMOVED', () => {
    // Without `i` flag 'Imsbc' doesn't match → tag preserved (BUG)
    const result = validateCitations('[Source: Imsbc §1.1] text', []);
    expect(result).toBe(' text');
  });
});

// ─── Vertex AI Search metadata format compatibility ────────────────────────────

describe('Vertex AI Search metadata format', () => {
  it('VX-META-01: IMSBC chunk from Vertex with required metadata fields validates correctly', () => {
    const vertexChunk: RetrievedChunk = {
      content: 'Group A cargoes may liquefy...',
      metadata: {
        source: 'imsbc',
        section: '3.1',
        id: 'imsbc-doc-3.1',
        sourceUrl: 'https://example.com/imsbc/ch3',
        title: 'Group A Cargoes',
      },
      distance: 0.15,
      chunkId: 'vertex-imsbc-3.1',
    };

    const result = validateCitations('[Source: IMSBC §3.1] text', [vertexChunk]);
    expect(result).toBe('[Source: IMSBC §3.1] text');
  });

  it('VX-META-02: IGC chunk from Vertex validates correctly', () => {
    const vertexChunk: RetrievedChunk = {
      content: 'Fire detection systems...',
      metadata: {
        source: 'igc',
        section: '7.2',
        id: 'igc-doc-7.2',
        sourceUrl: 'https://example.com/igc/ch7',
        title: 'Fire Safety',
      },
      distance: 0.12,
      chunkId: 'vertex-igc-7.2',
    };

    const result = validateCitations('[Source: IGC 7.2] text', [vertexChunk]);
    expect(result).toBe('[Source: IGC 7.2] text');
  });

  it('VX-META-03: JWC chunk from Vertex with bulletinId validates [JWC-bulletinId] format', () => {
    const vertexChunk: RetrievedChunk = {
      content: 'War risk zone includes...',
      metadata: {
        source: 'jwc',
        id: 'LMA-123',
        bulletinId: 'LMA-123',
        sourceUrl: 'https://example.com/jwc/LMA-123',
        title: 'Black Sea War Risk Zone',
      },
      distance: 0.10,
      chunkId: 'vertex-jwc-LMA-123',
    };

    const result = validateCitations('[JWC-LMA-123] text', [vertexChunk]);
    expect(result).toBe('[JWC-LMA-123] text');
  });

  it('VX-META-04: JWC chunk checks both metadata.id and metadata.bulletinId', () => {
    // Validator checks metadata.id === bulletinId OR metadata.bulletinId === bulletinId
    const vertexChunkIdOnly: RetrievedChunk = {
      content: 'War risk zone...',
      metadata: {
        source: 'jwc',
        id: 'LMA-456',
        // bulletinId not set
      },
      distance: 0.08,
      chunkId: 'vertex-jwc-456',
    };

    const result = validateCitations('[JWC-LMA-456] text', [vertexChunkIdOnly]);
    expect(result).toBe('[JWC-LMA-456] text');
  });

  it('VX-META-05: Vertex chunk with hallucinated section gets citation removed', () => {
    const vertexChunk: RetrievedChunk = {
      content: 'Some content',
      metadata: {
        source: 'imsbc',
        section: '5.2',
        id: 'imsbc-5.2',
      },
      distance: 0.20,
      chunkId: 'vertex-imsbc-5.2',
    };

    // LLM hallucinates §99.9 not in retrieved chunks
    const result = validateCitations('[Source: IMSBC §99.9] hallucinated text', [vertexChunk]);
    expect(result).toBe(' hallucinated text');
  });
});
