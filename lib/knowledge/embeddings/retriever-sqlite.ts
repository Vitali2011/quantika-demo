/**
 * Hybrid retriever: FTS5 BM25 + vec0 cosine + Reciprocal Rank Fusion (RRF)
 * Spec: spec-07-fts5-bm25-search-select-rowid-content-metadata-rank-from-ftstable-order-by-rank-limit-topk
 * Spec: spec-08-vec0-cosine-k-nn-select-rowid-content-metadata-distance-from-vectortable-where-embedding-match-order-by-distance-limit-topk
 * Spec: spec-09-rrf-merge-score-doc-1-rrfk-rank-i-for-each-ranking-list-documents-in-both-lists-accumulate-from-both-terms
 * Spec: spec-10-sort-descending-return-top-topn-as-retrievedchunk
 *
 * Input Contract:
 * - Empty query ("") → returns [] without API call
 * - null/undefined query → returns [] (runtime guard)
 * - Empty vectorTable/ftsTable → throws TypeError
 * - Negative topK → clamp to 1 (retrieve only)
 * - topK > 1000 → clamp to 1000 (retrieve() only; searchVec0 throws RangeError at >4096)
 * - topN = 0 → returns []
 * - NaN/Infinity/0 in rrfK → use default 60
 * - FTS5 syntax in query → escaped with double quotes (phrase match)
 */

import { embedQuery } from '@/lib/knowledge/embeddings/client';
import { getDb } from '@/lib/db';
import { isRagEnabled } from '@/lib/knowledge/flags';
import type { RetrievedChunk, ChunkMetadata } from '@/lib/knowledge/embeddings/chunks';
import Database from 'better-sqlite3';

const ALLOWED_VEC_TABLES = ['imsbc_vec', 'igc_vec', 'jwc_vec', 'bimco_vec'] as const;
const ALLOWED_FTS_TABLES = ['imsbc_fts', 'igc_fts', 'jwc_fts', 'bimco_fts'] as const;

/**
 * Vec0 cosine k-NN retriever (spec-08)
 *
 * Executes sqlite-vec cosine similarity search against a vec0 virtual table.
 * Returns results sorted by cosine distance ascending (closest first).
 *
 * Input Contract:
 * - embedding: Float32Array[768] required → throws RangeError if not 768-dimensional
 * - tableName: string required → SQLite throws if nonexistent
 * - topK: number optional (default 5) → throws RangeError if NaN/Infinity/negative/> 4096, returns [] if 0
 * - db: Database optional → defaults to getDb()
 * - Feature flag: throws Error if KNOWLEDGE_RAG_ENABLED !== "true"
 *
 * @param embedding - Query embedding (Float32Array[768])
 * @param tableName - Vec0 table name (e.g., 'imsbc_vec')
 * @param topK - Maximum results to return (default 5)
 * @param db - Database instance (optional)
 * @returns RetrievedChunk[] sorted by cosine distance ascending
 */
export function searchVec0(
  embedding: Float32Array,
  tableName: string,
  topK: number = 5,
  db?: Database.Database
): RetrievedChunk[] {
  // Guard: RAG feature flag
  if (!isRagEnabled()) {
    throw new Error('RAG is not enabled');
  }

  // Guard: embedding dimension validation
  if (embedding.length !== 768) {
    throw new RangeError('Embedding must be 768-dimensional');
  }

  // Guard: tableName validation
  if (!tableName || tableName.trim().length === 0) {
    throw new TypeError('tableName required');
  }

  if (!ALLOWED_VEC_TABLES.includes(tableName as any)) {
    throw new Error(`Invalid table name: ${tableName}. Must be one of: ${ALLOWED_VEC_TABLES.join(', ')}`);
  }

  // Guard: topK validation
  if (!Number.isFinite(topK)) {
    throw new RangeError('topK must be a positive integer');
  }

  if (topK < 0) {
    throw new RangeError('topK must be a positive integer');
  }

  if (topK > 4096) {
    throw new RangeError('topK exceeds sqlite-vec knn limit of 4096');
  }

  // Early return: topK = 0
  if (topK === 0) {
    return [];
  }

  // Get database instance
  const database = db ?? getDb();

  // Serialize embedding to JSON for sqlite-vec MATCH parameter
  const embeddingJson = JSON.stringify(Array.from(embedding));

  // Execute vec0 k-NN query
  const rows = database
    .prepare(
      `SELECT rowid, content, metadata, vec_distance_cosine(embedding, ?) as distance FROM ${tableName} ORDER BY distance LIMIT ?`
    )
    .all(embeddingJson, topK) as Array<{
      rowid: number;
      content: string;
      metadata: string;
      distance: number;
    }>;

  // Map rows to RetrievedChunk[]
  return rows.map((row) => {
    // Parse metadata JSON
    let parsedMetadata: ChunkMetadata;
    try {
      parsedMetadata = JSON.parse(row.metadata) as ChunkMetadata;
    } catch {
      // Fallback: preserve raw string if JSON invalid
      parsedMetadata = { source: 'unknown', raw: row.metadata } as ChunkMetadata & { raw?: string };
    }

    return {
      content: row.content,
      metadata: parsedMetadata,
      distance: row.distance,
      chunkId: String(row.rowid),
    };
  });
}

export interface RetrieveOptions {
  vectorTable: string; // e.g., 'imsbc_vec'
  ftsTable: string; // e.g., 'imsbc_fts'
  topK?: number; // candidates per ranker, default 20
  topN?: number; // final results after RRF, default 5
  rrfK?: number; // RRF constant, default 60
  db?: Database.Database; // optional db instance for testing
}

/**
 * Ranked document from a single ranking list (FTS5 or vec0)
 */
export interface RankedDoc {
  rowid: number;
  content: string;
  metadata: string;  // JSON string
  rank: number;      // 1-based position in the source list
  source?: 'fts' | 'vec';
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

/**
 * Hybrid retriever: combines FTS5 BM25 keyword search with sqlite-vec cosine similarity
 * via Reciprocal Rank Fusion (RRF).
 *
 * @param query - Search query string (empty string returns [])
 * @param opts - Retrieval options (vectorTable, ftsTable, topK, topN, rrfK, db)
 * @returns Promise<RetrievedChunk[]> sorted by RRF score descending
 */
export async function retrieve(
  query: string,
  opts: RetrieveOptions
): Promise<RetrievedChunk[]> {
  // Guard: RAG feature flag
  if (!isRagEnabled()) {
    throw new Error('RAG is not enabled');
  }

  // Guard: empty/null/undefined query
  if (!query || query.trim().length === 0) {
    return [];
  }

  // Guard: required table names
  if (!opts.vectorTable || opts.vectorTable.trim().length === 0) {
    throw new TypeError('vectorTable required');
  }
  if (!opts.ftsTable || opts.ftsTable.trim().length === 0) {
    throw new TypeError('ftsTable required');
  }

  if (!ALLOWED_VEC_TABLES.includes(opts.vectorTable as any)) {
    throw new Error(`Invalid vectorTable: ${opts.vectorTable}. Must be one of: ${ALLOWED_VEC_TABLES.join(', ')}`);
  }
  if (!ALLOWED_FTS_TABLES.includes(opts.ftsTable as any)) {
    throw new Error(`Invalid ftsTable: ${opts.ftsTable}. Must be one of: ${ALLOWED_FTS_TABLES.join(', ')}`);
  }

  // Normalize parameters with defaults and boundary guards
  let topK = opts.topK ?? 20;
  let topN = opts.topN ?? 5;
  let rrfK = opts.rrfK ?? 60;

  // Guard: topK boundaries (negative → 1, 0 → default 20, >1000 → 1000, NaN/Infinity → 1000)
  if (!Number.isFinite(topK) || topK < 0) {
    topK = topK === 0 ? 20 : topK < 0 ? 1 : 1000;
  }
  if (topK > 1000) {
    topK = 1000;
  }

  // Guard: topN = 0 → return empty array
  if (topN === 0) {
    return [];
  }

  // Guard: rrfK special floats → default 60
  if (!Number.isFinite(rrfK) || rrfK <= 0) {
    rrfK = 60;
  }

  const db = opts.db ?? getDb();

  // Step 1: Get query embedding
  const embedding = await embedQuery(query);

  // Step 2: FTS5 BM25 search
  // Escape query by wrapping in double quotes to prevent FTS5 syntax injection
  const escapedQuery = `"${query.replace(/"/g, '""')}"`;

  const ftsResults: RankedDoc[] = db
    .prepare(
      `SELECT rowid, content, metadata, rank FROM ${opts.ftsTable}(?) ORDER BY rank LIMIT ?`
    )
    .all(escapedQuery, topK)
    .map((row: any, index: number) => ({
      rowid: row.rowid,
      content: row.content,
      metadata: row.metadata,
      rank: index + 1, // 1-based ranking
      source: 'fts' as const,
    }));

  // Step 3: vec0 cosine k-NN search
  const vecResults: RankedDoc[] = db
    .prepare(
      `SELECT rowid, content, metadata, vec_distance_cosine(embedding, ?) as distance FROM ${opts.vectorTable} ORDER BY distance LIMIT ?`
    )
    .all(embedding, topK)
    .map((row: any, index: number) => ({
      rowid: row.rowid,
      content: row.content,
      metadata: row.metadata,
      rank: index + 1, // 1-based ranking
      source: 'vec' as const,
    }));

  // Guard: both rankers return empty → return []
  if (ftsResults.length === 0 && vecResults.length === 0) {
    return [];
  }

  // Step 4: RRF merge using the standalone rrfMerge function
  return rrfMerge(ftsResults, vecResults, { rrfK, topN });
}
