/**
 * Retriever dispatcher — routes retrieve() calls to the active backend.
 *
 * KNOWLEDGE_BACKEND=vertex → Vertex AI Search
 * KNOWLEDGE_BACKEND=sqlite (default) → local SQLite vec0 + FTS5 hybrid retriever
 *
 * Re-exports searchVec0, rrfMerge, and all types from retriever-sqlite
 * so that existing consumers import from this file with zero changes.
 */

import { knowledgeBackend } from '@/lib/knowledge/flags';
import type { RetrievedChunk } from '@/lib/knowledge/embeddings/chunks';

// Re-export everything consumers depend on from the SQLite retriever
export {
  searchVec0,
  rrfMerge,
  type RetrieveOptions,
  type RankedDoc,
  type RrfMergeOptions,
} from '@/lib/knowledge/embeddings/retriever-sqlite';

import { retrieve as retrieveSqlite } from '@/lib/knowledge/embeddings/retriever-sqlite';
import type { RetrieveOptions } from '@/lib/knowledge/embeddings/retriever-sqlite';

/**
 * Hybrid retriever: dispatches to Vertex AI Search or SQLite based on
 * KNOWLEDGE_BACKEND env var. Signature identical to the original retrieve().
 */
export async function retrieve(
  query: string,
  opts: RetrieveOptions
): Promise<RetrievedChunk[]> {
  if (knowledgeBackend() === 'vertex') {
    // Lazy-import to avoid loading the Vertex SDK when using sqlite backend
    const { retrieve: retrieveVertex } = await import(
      '@/lib/knowledge/embeddings/retriever-vertex'
    );
    return retrieveVertex(query, opts);
  }

  return retrieveSqlite(query, opts);
}
