/**
 * Hybrid retriever: FTS5 BM25 + sqlite-vec cosine k-NN + RRF merge
 *
 * This is a minimal stub for spec-10. Full implementation should come from specs 07-09.
 * TEMP-STAB-spec-10: Minimal retriever structure for sort-and-return step;
 * specs 07-09 should provide full BM25/vec0/RRF logic.
 */

import type { Database } from "better-sqlite3";
import type { RetrievedChunk, ChunkMetadata } from "./chunks";

export interface RetrieveOptions {
  vectorTable: string; // e.g. 'imsbc_vec'
  ftsTable: string; // e.g. 'imsbc_fts'
  topK?: number; // candidates per ranker, default 20
  topN?: number; // final results after RRF, default 5
  rrfK?: number; // RRF constant, default 60
}

interface RRFEntry {
  rowid: string;
  content: string;
  metadata: ChunkMetadata;
  score: number;
}

/**
 * Sort RRF map entries by score descending, apply topN limit, return RetrievedChunk[]
 *
 * Input Contract:
 * - topN: 0 → returns []
 * - topN: NaN/undefined → default 5
 * - topN: negative → returns []
 * - topN: > candidates.length → returns all candidates
 * - rrfMap: empty → returns []
 * - entry.score: NaN → filtered out before sorting
 */
function sortAndReturn(
  rrfMap: Map<string, RRFEntry>,
  topN: number | undefined
): RetrievedChunk[] {
  // Handle topN boundary cases
  const effectiveTopN =
    topN === undefined || !Number.isFinite(topN) || topN < 0
      ? topN === undefined || !Number.isFinite(topN)
        ? 5 // default
        : 0 // negative or invalid returns []
      : topN;

  // Empty map or topN=0 → return []
  if (rrfMap.size === 0 || effectiveTopN === 0) {
    return [];
  }

  // Convert map to array and filter out NaN scores
  const entries = Array.from(rrfMap.values()).filter((entry) =>
    Number.isFinite(entry.score)
  );

  // Sort by score descending, then by rowid ascending for tie-breaking
  entries.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score; // Descending score
    }
    return a.rowid.localeCompare(b.rowid); // Ascending rowid for ties
  });

  // Slice to topN
  const topEntries = entries.slice(0, effectiveTopN);

  // Map to RetrievedChunk format
  return topEntries.map((entry) => ({
    content: entry.content,
    metadata: entry.metadata,
    distance: entry.score, // RRF score as distance
    chunkId: String(entry.rowid),
  }));
}

export async function retrieve(
  db: Database,
  query: string,
  opts: RetrieveOptions
): Promise<RetrievedChunk[]> {
  // TEMP-STAB-spec-10: Full retrieve logic from specs 07-09 pending
  // This stub focuses only on the sortAndReturn step (spec-10)
  const rrfMap = new Map<string, RRFEntry>();
  const topN = opts.topN ?? 5;
  return sortAndReturn(rrfMap, topN);
}
