import type { RetrievedChunk } from '@/lib/knowledge/embeddings/chunks';

/**
 * Strips hallucinated citation tags from an LLM response.
 * A citation is "hallucinated" if no retrieved chunk backs it.
 *
 * Handled formats:
 *   [Source: IMSBC §X.Y]   — IMSBC section reference
 *   [Source: IGC X.Y]      — IGC section reference
 *   [JWC-bulletinId]       — JWC war-risk bulletin reference
 */
export function validateCitations(
  llmResponse: string,
  retrievedChunks: RetrievedChunk[]
): string {
  // Regex to match citation tags in 3 formats:
  // [Source: IMSBC §X.Y]   or   [Source: IGC X.Y]   or   [JWC-bulletinId]
  const CITATION_PATTERN = /\[(?:Source:\s*(IMSBC|IGC)\s*§?([\w.]+)|JWC-([\w-]+))\]/g;

  return llmResponse.replace(CITATION_PATTERN, (fullMatch, sourceType, sectionRef, bulletinId) => {
    if (bulletinId) {
      // [JWC-bulletinId] — check if any chunk has this bulletinId.
      // The compare-routes route stores bulletin id in chunk.metadata?.id (used as bulletinId
      // when building [JWC-${bulletinId}] citation tags). We also check metadata?.bulletinId
      // as a fallback for chunks stored with explicit bulletinId field.
      const found = retrievedChunks.some(
        (c) =>
          c.metadata?.source === 'jwc' &&
          (c.metadata?.id === bulletinId || c.metadata?.bulletinId === bulletinId)
      );
      return found ? fullMatch : '';
    }

    if (sourceType && sectionRef) {
      // [Source: IMSBC §X.Y] or [Source: IGC X.Y]
      const sourceLower = sourceType.toLowerCase();
      const found = retrievedChunks.some((c) => {
        if (c.metadata?.source !== sourceLower) return false;
        const section = String(c.metadata?.section ?? '');
        return section.includes(sectionRef) || sectionRef.includes(section);
      });
      return found ? fullMatch : '';
    }

    // Unknown format — preserve as-is
    return fullMatch;
  });
}
