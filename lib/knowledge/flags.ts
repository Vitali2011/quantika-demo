/**
 * @file flags.ts
 * @description RAG feature flags for Phase 2 Knowledge Layer.
 * Spec: spec-03-all-6-virtual-tables-exist-after-migration
 *
 * Provides guards and helpers for RAG subsystem:
 * - isRagEnabled: feature toggle for retrieval (default: false until embeddings populated)
 * - knowledgeBackend: selects retrieval backend ('sqlite' or 'vertex')
 * - ftsTableForSource/vecTableForSource: derive table names from source slugs
 */

export type KnowledgeBackend = 'sqlite' | 'vertex';

/**
 * Returns true only when KNOWLEDGE_RAG_ENABLED === "true" (strict lowercase).
 * Default: false (safe — new tables and embedding pipeline inert until operator enables).
 * @returns {boolean} Whether RAG retrieval is enabled
 */
export function isRagEnabled(): boolean {
  return process.env.KNOWLEDGE_RAG_ENABLED === 'true';
}

/**
 * Selects the knowledge retrieval backend.
 * KNOWLEDGE_BACKEND=vertex → Vertex AI Search; anything else → sqlite (default).
 * isRagEnabled() remains the master on/off switch regardless of backend.
 */
export function knowledgeBackend(): KnowledgeBackend {
  return process.env.KNOWLEDGE_BACKEND === 'vertex' ? 'vertex' : 'sqlite';
}

/**
 * Derives FTS5 table name from source slug.
 * @param slug - Source slug (e.g., "imsbc", "igc", "jwc")
 * @returns FTS5 table name (e.g., "imsbc_fts")
 */
export function ftsTableForSource(slug: string): string {
  return `${slug}_fts`;
}

/**
 * Derives vec0 table name from source slug.
 * @param slug - Source slug (e.g., "imsbc", "igc", "jwc")
 * @returns vec0 table name (e.g., "imsbc_vec")
 */
export function vecTableForSource(slug: string): string {
  return `${slug}_vec`;
}
