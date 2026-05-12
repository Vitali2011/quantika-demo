/**
 * BIMCO chunker — converts raw charter party text into individual clauses
 * Spec: gamma-09
 *
 * Input contract (.specs/gamma-09-input-contracts.md):
 * - Empty/null/undefined rawText → return []
 * - Invalid charterParty → throw Error("Invalid charterParty")
 * - Non-string rawText → throw TypeError
 * - Very large text → process normally (no arbitrary limit)
 */

import type { BimcoClause, CharterPartyType } from './types';

const VALID_CHARTER_PARTIES: CharterPartyType[] = ['GENCON 2022', 'HEAVYCON', 'PROJECTCON'];

/**
 * Chunks raw charter party text into individual BimcoClause objects.
 * Each clause is identified by patterns like "Clause N:" or numbered sections.
 *
 * @param rawText - Raw charter party document text
 * @param charterParty - Charter party type (GENCON 2022, HEAVYCON, PROJECTCON)
 * @returns Array of BimcoClause objects
 * @throws TypeError if rawText is not a string
 * @throws Error if charterParty is not valid
 */
export function chunkBimco(rawText: string, charterParty: CharterPartyType): BimcoClause[] {
  // Input validation: null/undefined → return []
  if (rawText === null || rawText === undefined) {
    return [];
  }

  // Input validation: non-string → throw TypeError
  if (typeof rawText !== 'string') {
    throw new TypeError('rawText must be string');
  }

  // Input validation: invalid charterParty → throw Error
  if (!VALID_CHARTER_PARTIES.includes(charterParty)) {
    throw new Error('Invalid charterParty');
  }

  // Input validation: empty/whitespace-only → return []
  if (rawText.trim() === '') {
    return [];
  }

  // Split by clause patterns: "Clause N:" or "Clause N."
  // Match variations like:
  // - "Clause 1: Title"
  // - "Clause 1. Title"
  // - "1. Title"
  // - "1: Title"
  const clauseRegex = /(?:Clause\s+)?(\d+)[:.]\s*([^\n]+)/gi;
  const matches = Array.from(rawText.matchAll(clauseRegex));

  if (matches.length === 0) {
    // No recognizable clause structure → return empty
    return [];
  }

  const clauses: BimcoClause[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const clauseNumber = match[1];
    const title = match[2].trim();

    // Extract text from current match to next match (or end of string)
    const startIndex = match.index! + match[0].length;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index! : rawText.length;
    const text = rawText.substring(startIndex, endIndex).trim();

    // Skip if text is empty
    if (text.length === 0) {
      continue;
    }

    // Generate clause ID
    const cpSlug = charterParty.toLowerCase().replace(/\s+/g, '');
    const id = `${cpSlug}-clause${clauseNumber}`;

    // Generate source URL
    const cpUrlSlug = charterParty.toLowerCase().replace(/\s+\d+$/, '').replace(/\s+/g, '');
    const sourceUrl = `https://www.bimco.org/contracts-and-clauses/bimco-contracts/${cpUrlSlug}`;

    clauses.push({
      id,
      charterParty,
      clauseNumber,
      title,
      text,
      sourceUrl,
    });
  }

  return clauses;
}
