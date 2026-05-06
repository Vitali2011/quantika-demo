/**
 * Hybrid retriever: FTS5 BM25 + vec0 cosine + Reciprocal Rank Fusion (RRF)
 * Spec: spec-07-fts5-bm25-search-select-rowid-content-metadata-rank-from-ftstable-order-by-rank-limit-topk
 *
 * Input Contract:
 * - Empty query ("") → returns [] without API call
 * - null/undefined query → returns [] (runtime guard)
 * - Empty vectorTable/ftsTable → throws TypeError
 * - Negative topK → clamp to 1
 * - topK > 1000 → clamp to 1000
 * - topN = 0 → returns []
 * - NaN/Infinity/0 in rrfK → use default 60
 * - FTS5 syntax in query → escaped with double quotes (phrase match)
 */

import { embedQuery } from '@/lib/knowledge/embeddings/client';
import { getDb } from '@/lib/db';
import { RetrievedChunk } from '@/lib/knowledge/embeddings/chunks';
import Database from 'better-sqlite3';

export interface RetrieveOptions {
  vectorTable: string; // e.g., 'imsbc_vec'
  ftsTable: string; // e.g., 'imsbc_fts'
  topK?: number; // candidates per ranker, default 20
  topN?: number; // final results after RRF, default 5
  rrfK?: number; // RRF constant, default 60
  db?: Database.Database; // optional db instance for testing
}

interface RankedDoc {
  rowid: number;
  content: string;
  metadata: string;
  rank: number;
  source: 'fts' | 'vec';
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
      `SELECT rowid, content, metadata, distance FROM ${opts.vectorTable} WHERE embedding MATCH ? ORDER BY distance LIMIT ?`
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

  // Step 4: RRF merge
  // Formula: score(doc) = Σ 1/(rrfK + rank_i)
  const scoreMap = new Map<number, number>();
  const docMap = new Map<number, RankedDoc>();

  // Accumulate scores from FTS5 results
  for (const doc of ftsResults) {
    const score = 1 / (rrfK + doc.rank);
    scoreMap.set(doc.rowid, (scoreMap.get(doc.rowid) ?? 0) + score);
    docMap.set(doc.rowid, doc);
  }

  // Accumulate scores from vec0 results
  for (const doc of vecResults) {
    const score = 1 / (rrfK + doc.rank);
    scoreMap.set(doc.rowid, (scoreMap.get(doc.rowid) ?? 0) + score);
    if (!docMap.has(doc.rowid)) {
      docMap.set(doc.rowid, doc);
    }
  }

  // Step 5: Sort by RRF score descending, then by rowid ascending (tie-breaking)
  const sortedDocs = Array.from(scoreMap.entries())
    .sort((a, b) => {
      // Primary: score descending
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      // Secondary: rowid ascending (deterministic tie-breaking)
      return a[0] - b[0];
    })
    .slice(0, topN); // Limit to topN results

  // Step 6: Convert to RetrievedChunk[]
  const results: RetrievedChunk[] = sortedDocs.map(([rowid, rrfScore]) => {
    const doc = docMap.get(rowid)!;
    return {
      content: doc.content,
      metadata: JSON.parse(doc.metadata),
      distance: rrfScore, // Use RRF score as distance field
      chunkId: rowid.toString(),
      score: rrfScore, // Optional score field
    };
  });

  return results;
}
