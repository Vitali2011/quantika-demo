/**
 * Vertex AI Search retriever — implements identical retrieve() signature
 *
 * Maps vectorTable → engine ID, calls SearchServiceClient.search(),
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

import { SearchServiceClient } from "@google-cloud/discoveryengine";
import type { RetrievedChunk, ChunkMetadata } from "@/lib/knowledge/embeddings/chunks";
import type { RetrieveOptions } from "@/lib/knowledge/embeddings/retriever-sqlite";

const ALLOWED_VEC_TABLES = ["imsbc_vec", "igc_vec", "jwc_vec", "bimco_vec"] as const;

/**
 * Maps SQLite vector table names to Vertex AI Search engine IDs.
 * Env vars: VERTEX_ENGINE_IMSBC / VERTEX_ENGINE_IGC / VERTEX_ENGINE_JWC / VERTEX_ENGINE_BIMCO
 * Function form to allow tests to mock env vars after module load.
 */
function getEngineId(vectorTable: string): string {
  const map: Record<string, string> = {
    imsbc_vec: process.env.VERTEX_ENGINE_IMSBC || "",
    igc_vec:   process.env.VERTEX_ENGINE_IGC   || "",
    jwc_vec:   process.env.VERTEX_ENGINE_JWC   || "",
    bimco_vec: process.env.VERTEX_ENGINE_BIMCO || "",
  };
  return map[vectorTable] || "";
}

/**
 * Hybrid retriever using Vertex AI Search (semantic + keyword fusion built-in)
 *
 * @param query - Search query string (empty string returns [])
 * @param opts - Retrieval options (vectorTable for engine mapping, ftsTable ignored, topN, db ignored)
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
    throw new TypeError("vectorTable required");
  }

  // Guard: allow-list enforcement
  if (!ALLOWED_VEC_TABLES.includes(opts.vectorTable as any)) {
    throw new Error(`Invalid vectorTable: ${opts.vectorTable}. Must be one of: ${ALLOWED_VEC_TABLES.join(", ")}`);
  }

  // Guard: topN = 0 → return empty array (identical to sqlite version)
  const topN = opts.topN ?? 5;
  if (topN === 0) {
    return [];
  }

  // Map vectorTable to engine ID
  const engineId = getEngineId(opts.vectorTable);
  if (!engineId) {
    throw new Error(
      `No engine configured for vectorTable: ${opts.vectorTable}. ` +
      `Set VERTEX_ENGINE_${opts.vectorTable.replace("_vec", "").toUpperCase()} env var.`
    );
  }

  // Initialize Vertex AI Search client
  const projectId = process.env.VERTEX_SEARCH_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const location  = process.env.VERTEX_SEARCH_LOCATION || "global";

  if (!projectId) {
    throw new Error("VERTEX_SEARCH_PROJECT or GOOGLE_CLOUD_PROJECT env var must be set");
  }

  const client = new SearchServiceClient();

  // Engine-level serving config (not datastore-level)
  const servingConfig =
    `projects/${projectId}/locations/${location}/collections/default_collection` +
    `/engines/${engineId}/servingConfigs/default_search`;

  // extractiveContentSpec is Enterprise-edition Discovery Engine only.
  // On Standard engines it triggers FAILED_PRECONDITION (gRPC 9). Default OFF;
  // opt in via VERTEX_USE_ENTERPRISE_EXTRACTIVE=true after upgrading the engine.
  const useEnterpriseExtractive =
    process.env.VERTEX_USE_ENTERPRISE_EXTRACTIVE === "true";

  const contentSearchSpec: Record<string, unknown> = {
    snippetSpec: { returnSnippet: true },
  };
  if (useEnterpriseExtractive) {
    contentSearchSpec.extractiveContentSpec = {
      maxExtractiveSegmentCount: 1,
      maxExtractiveAnswerCount: 1,
    };
  }

  try {
    // Call Vertex AI Search
    const response = await client.search({
      servingConfig,
      query,
      pageSize: topN,
      contentSearchSpec,
    });

    // Map Vertex response to RetrievedChunk[]
    const chunks: RetrievedChunk[] = [];

    for await (const result of response) {
      if (!result) continue;
      const searchResult = result as any;
      const doc = searchResult.document;
      if (!doc) continue;

      // Extract content — extractive segment > snippet > structData.content
      let content = "";
      if (doc.derivedStructData) {
        const derived = doc.derivedStructData as any;
        if (derived.extractive_segments?.length) {
          content = derived.extractive_segments[0]?.content || "";
        }
        if (!content && derived.snippets?.length) {
          content = derived.snippets[0]?.snippet || "";
        }
      }
      if (!content && doc.structData?.content) {
        content = String(doc.structData.content);
      }

      // Extract metadata from structData (set during document upload)
      const sd = (doc.structData || {}) as any;
      const metadata: ChunkMetadata = {
        source:    String(sd.source || opts.vectorTable.replace("_vec", "")),
        section:   sd.section   ? String(sd.section)   : undefined,
        id:        sd.id        ? String(sd.id)        : doc.id,
        sourceUrl: sd.sourceUrl ? String(sd.sourceUrl) : undefined,
        title:     sd.title     ? String(sd.title)     : doc.name,
        // JWC citations: validator checks metadata.id OR metadata.bulletinId
        bulletinId: sd.bulletinId ? String(sd.bulletinId) : undefined,
      };

      // Vertex relevance score 0-1 (higher=better) → invert to distance (lower=better)
      const score    = searchResult.relevanceScore ?? 0;
      const distance = 1 - score;

      chunks.push({
        content,
        metadata,
        distance,
        chunkId: doc.id || `vertex-${chunks.length}`,
        score,
      });
    }

    return chunks;
  } catch (error) {
    console.error(`[retriever-vertex] Search failed for engine ${engineId}:`, error);
    throw error;
  }
}
