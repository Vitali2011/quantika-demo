/**
 * Hybrid RAG retriever combining FTS5 BM25 and vec0 cosine similarity
 * using Reciprocal Rank Fusion (RRF) for result merging
 *
 * Spec: spec-09-rrf-merge-score-doc-1-rrfk-rank-i-for-each-ranking-list-documents-in-both-lists-accumulate-from-both-terms
 */

import type { RetrievedChunk, ChunkMetadata } from './chunks';

/**
 * Ranked document from a single ranking list (FTS5 or vec0)
 */
export interface RankedDoc {
  rowid: number;
  content: string;
  metadata: string;  // JSON string
  rank: number;      // 1-based position in the source list
}

/**
 * Options for RRF merge algorithm
 */
export interface RrfMergeOptions {
  rrfK?: number;  // RRF constant (default 60)
  topN?: number;  // Number of top results to return (default 5)
}

/**
 * Merge two ranked result lists using Reciprocal Rank Fusion (RRF)
 *
 * RRF formula: score(doc) = Σ_r 1 / (k + rank_r(doc))
 * where r iterates over each ranking list (FTS5, vec0)
 *
 * Input Contract:
 * - Empty arrays: valid, compute from other list or return []
 * - rrfK: negative/0/NaN/Infinity → clamp (negative/0 to 1, NaN/Infinity to 60)
 * - topN: negative/0 → clamp to 0, return []
 * - metadata: invalid JSON → preserve as-is, no crash
 *
 * @param ftsResults - FTS5 BM25 ranked results
 * @param vecResults - vec0 cosine k-NN ranked results
 * @param opts - RRF merge options
 * @returns Merged and sorted results as RetrievedChunk[] with RRF score in distance field
 */
export function rrfMerge(
  ftsResults: RankedDoc[],
  vecResults: RankedDoc[],
  opts?: RrfMergeOptions
): RetrievedChunk[] {
  // Input validation and defaults
  let rrfK = opts?.rrfK ?? 60;
  let topN = opts?.topN ?? 5;

  // Clamp rrfK: negative/0 → 1, NaN/Infinity → 60 (default)
  if (!Number.isFinite(rrfK) || isNaN(rrfK)) {
    rrfK = 60;
  } else if (rrfK <= 0) {
    rrfK = 1;
  }

  // Clamp topN: negative → 0
  if (topN < 0) {
    topN = 0;
  }

  // Early return for topN=0
  if (topN === 0) {
    return [];
  }

  // Build accumulator map: rowid → { content, metadata, score }
  const scoreMap = new Map<number, { content: string; metadata: string; score: number }>();

  // Accumulate scores from FTS5 results
  for (const doc of ftsResults) {
    const rrfScore = 1 / (rrfK + doc.rank);
    const existing = scoreMap.get(doc.rowid);

    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(doc.rowid, {
        content: doc.content,
        metadata: doc.metadata,
        score: rrfScore,
      });
    }
  }

  // Accumulate scores from vec0 results
  for (const doc of vecResults) {
    const rrfScore = 1 / (rrfK + doc.rank);
    const existing = scoreMap.get(doc.rowid);

    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(doc.rowid, {
        content: doc.content,
        metadata: doc.metadata,
        score: rrfScore,
      });
    }
  }

  // Convert map to array and sort
  const candidates = Array.from(scoreMap.entries()).map(([rowid, data]) => ({
    rowid,
    content: data.content,
    metadata: data.metadata,
    score: data.score,
  }));

  // Sort by score descending, then by rowid ascending (tie-breaking)
  candidates.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score; // Higher score first
    }
    return a.rowid - b.rowid; // Lower rowid first for ties
  });

  // Take top N and convert to RetrievedChunk[]
  const topCandidates = candidates.slice(0, topN);

  return topCandidates.map((candidate) => {
    // Parse metadata JSON, fallback to raw string if invalid
    let parsedMetadata: ChunkMetadata;
    try {
      parsedMetadata = JSON.parse(candidate.metadata) as ChunkMetadata;
    } catch {
      // Invalid JSON: preserve as raw string in metadata object
      parsedMetadata = { source: 'unknown', raw: candidate.metadata } as ChunkMetadata & { raw?: string };
    }

    return {
      content: candidate.content,
      metadata: parsedMetadata,
      distance: candidate.score,
      chunkId: String(candidate.rowid),
    };
  });
}
