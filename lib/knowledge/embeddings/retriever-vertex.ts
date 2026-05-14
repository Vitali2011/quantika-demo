/**
 * Vertex AI Search retriever — implements identical retrieve() signature
 *
 * Maps vectorTable → datastore ID, calls SearchServiceClient.search(),
 * transforms response to RetrievedChunk[] with required metadata fields
 * (source, section, id, sourceUrl, title) for citations validator.
 *
 * Input Contract (identical to retriever-sqlite.ts):
 * - Empty query ("") → returns [] without API call
 * - null/undefined query → returns [] (runtime guard)
 * - Empty vectorTable → throws TypeError
 * - topN = 0 → returns []
 * - vectorTable allow-list enforcement
 */

import { SearchServiceClient } from '@google-cloud/discoveryengine';
import type { RetrievedChunk, ChunkMetadata } from '@/lib/knowledge/embeddings/chunks';
import type { RetrieveOptions } from '@/lib/knowledge/embeddings/retriever-sqlite';

const ALLOWED_VEC_TABLES = ['imsbc_vec', 'igc_vec', 'jwc_vec', 'bimco_vec'] as const;

/**
 * Maps SQLite vector table names to Vertex AI Search datastore IDs.
 * Function form to allow tests to mock env vars after module load.
 */
function getDatastoreId(vectorTable: string): string {
  const map: Record<string, string> = {
    imsbc_vec: process.env.VERTEX_DATASTORE_IMSBC || '',
    igc_vec: process.env.VERTEX_DATASTORE_IGC || '',
    jwc_vec: process.env.VERTEX_DATASTORE_JWC || '',
    bimco_vec: process.env.VERTEX_DATASTORE_BIMCO || '',
  };
  return map[vectorTable] || '';
}

/**
 * Hybrid retriever using Vertex AI Search (semantic + keyword fusion built-in)
 *
 * @param query - Search query string (empty string returns [])
 * @param opts - Retrieval options (vectorTable for datastore mapping, ftsTable ignored, topN, db ignored)
 * @returns Promise<RetrievedChunk[]> with metadata fields required by citations validator
 */
export async function retrieve(
  query: string,
  opts: RetrieveOptions
): Promise<RetrievedChunk[]> {
  // Guard: empty/null/undefined query (identical to sqlite version)
  if (!query || query.trim().length === 0) {
    return [];
  }

  // Guard: required table names
  if (!opts.vectorTable || opts.vectorTable.trim().length === 0) {
    throw new TypeError('vectorTable required');
  }

  // Guard: allow-list enforcement
  if (!ALLOWED_VEC_TABLES.includes(opts.vectorTable as any)) {
    throw new Error(`Invalid vectorTable: ${opts.vectorTable}. Must be one of: ${ALLOWED_VEC_TABLES.join(', ')}`);
  }

  // Guard: topN = 0 → return empty array (identical to sqlite version)
  const topN = opts.topN ?? 5;
  if (topN === 0) {
    return [];
  }

  // Map vectorTable to datastore ID
  const datastoreId = getDatastoreId(opts.vectorTable);
  if (!datastoreId) {
    throw new Error(`No datastore configured for vectorTable: ${opts.vectorTable}. Set VERTEX_DATASTORE_${opts.vectorTable.replace('_vec', '').toUpperCase()} env var.`);
  }

  // Initialize Vertex AI Search client
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_SEARCH_LOCATION || 'global';

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT env var not set');
  }

  const client = new SearchServiceClient();

  // Construct serving config path
  const servingConfig = `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${datastoreId}/servingConfigs/default_config`;

  try {
    // Call Vertex AI Search
    const response = await client.search({
      servingConfig,
      query,
      pageSize: topN,
      // Enable extractive answers/segments for better snippet quality
      contentSearchSpec: {
        snippetSpec: {
          returnSnippet: true,
        },
        extractiveContentSpec: {
          maxExtractiveSegmentCount: 1,
          maxExtractiveAnswerCount: 1,
        },
      },
    });

    // Map Vertex response to RetrievedChunk[]
    const chunks: RetrievedChunk[] = [];

    // response is an iterable of results pages
    for await (const result of response) {
      if (!result) continue;
      // Type assertion: result is ISearchResult from async iterator
      const searchResult = result as any;
      const doc = searchResult.document;
      if (!doc) continue;

      // Extract content from snippet or extractive segment
      let content = '';
      if (doc.derivedStructData) {
        const structData = doc.derivedStructData as any;
        // Try extractive segments first (higher quality)
        if (structData.extractive_segments && Array.isArray(structData.extractive_segments) && structData.extractive_segments.length > 0) {
          content = structData.extractive_segments[0]?.content || '';
        }
        // Fallback to snippets
        if (!content && structData.snippets && Array.isArray(structData.snippets) && structData.snippets.length > 0) {
          content = structData.snippets[0]?.snippet || '';
        }
      }

      // Fallback to full content if no snippet/segment
      if (!content && doc.structData?.content) {
        content = String(doc.structData.content);
      }

      // Extract metadata from structData (set during Phase 0 document upload)
      const structData = doc.structData || {};
      const metadata: ChunkMetadata = {
        source: String(structData.source || opts.vectorTable.replace('_vec', '')),
        section: structData.section ? String(structData.section) : undefined,
        id: structData.id ? String(structData.id) : doc.id,
        sourceUrl: structData.sourceUrl ? String(structData.sourceUrl) : undefined,
        title: structData.title ? String(structData.title) : doc.name,
        // Preserve bulletinId for JWC citations (validator checks both metadata.id and metadata.bulletinId)
        bulletinId: structData.bulletinId ? String(structData.bulletinId) : undefined,
      };

      // Map relevance score to distance (lower is better in sqlite world)
      // Vertex relevance scores are typically 0-1 (higher is better)
      // Invert to match sqlite contract: distance = 1 - score
      const score = searchResult.relevanceScore ?? 0;
      const distance = 1 - score;

      chunks.push({
        content,
        metadata,
        distance,
        chunkId: doc.id || `vertex-${chunks.length}`,
        score, // Preserve original score for debugging
      });
    }

    return chunks;
  } catch (error) {
    // Log error but don't throw — graceful degradation pattern
    // (isRagEnabled() try/catch in endpoints handles this)
    console.error(`[retriever-vertex] Search failed for datastore ${datastoreId}:`, error);
    throw error; // Re-throw to let endpoint try/catch handle graceful degradation
  }
}
