/**
 * JWC (Joint War Committee) bulletin data types for RAG knowledge graph.
 * Phase 2: RAG expansion for JWC Listed Areas bulletins.
 */

export interface JwcBulletin {
  /** Unique bulletin identifier (e.g. "JWLA-033") */
  id: string;
  /** ISO 8601 date string (e.g. "2026-03-03") */
  publishDate: string;
  /** Bulletin title (e.g. "Hull War, Piracy, Terrorism and Related Perils — Listed Areas") */
  title: string;
  /** Full bulletin text content (HTML stripped to plain text) */
  rawText: string;
  /** URL of the specific bulletin page */
  sourceUrl: string;
}
