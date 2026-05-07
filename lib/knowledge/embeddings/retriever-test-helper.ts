/**
 * Test helper to expose internal sortAndReturn function for testing
 * This is a workaround until sortAndReturn is properly exported
 */

import type { RetrievedChunk, ChunkMetadata } from "./chunks";

interface RRFEntry {
  rowid: string;
  content: string;
  metadata: ChunkMetadata;
  score: number;
}

/**
 * Sort RRF map entries by score descending, apply topN limit, return RetrievedChunk[]
 *
 * Input Contract (see spec-10):
 * - topN: 0 → returns []
 * - topN: NaN/undefined → default 5
 * - topN: negative → returns []
 * - topN: > candidates.length → returns all candidates
 * - rrfMap: empty → returns []
 * - entry.score: NaN → filtered out before sorting
 */
export function sortAndReturn(
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
