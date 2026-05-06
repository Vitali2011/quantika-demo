/**
 * Chunk types for Knowledge Layer vector storage
 *
 * Input contract: exhausted by TypeScript types (no runtime validation needed)
 */

export interface ChunkMetadata {
  source: string; // e.g., 'imsbc', 'igc', 'jwc'
  sourceUrl?: string;
  section?: string; // e.g., 'Chapter 3.1'
  title?: string;
  [key: string]: any; // Allow additional source-specific metadata
}

export interface Chunk {
  content: string;
  metadata: ChunkMetadata;
}

export interface RetrievedChunk extends Chunk {
  distance: number; // Cosine distance from query vector (or RRF score in hybrid retrieval)
  chunkId: string; // Database row ID
  score?: number; // Optional RRF score for hybrid retrieval (spec-07)
}
