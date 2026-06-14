/**
 * Regex-based fallback for lastCargoes extraction.
 * Scans raw email body for L/C patterns that LLM missed.
 */

// Patterns that indicate last cargoes (case-insensitive)
const LC_PATTERNS = [
  // Header-style: "L/C:", "Last cargoes:", "Recent employment:", etc.
  // Stops at blank line or field names that could NOT be cargo (exclude "grain" since it IS a cargo)
  /(?:L\/C|last\s+cargoes?|last\s+loads?|prev(?:ious)?\s*cargoes?|recent\s+cargoes?|recent\s+employment|P\/C|L5C)\s*[:\-–]\s*([\s\S]+?)(?:\n[ \t]*\n|$|(?=\s*(?:open\s*:|dwt\s*:|grt\s*:|built\s*:|loa\s*:|beam\s*:|hold\s*:|speed\s*:|consumption\s*:)))/gi,
  // Prose-style: "Previously carried:", "Just completed:", "Having carried:", etc.
  /(?:just\s+completed|previously\s+carried|having\s+carried|last\s+three\s+(?:loads|voyages)\s+(?:were|was|:))\s*[:\-–]?\s*([\s\S]+?)(?:\n[ \t]*\n|$)/gi,
];

/**
 * Extract lastCargoes from raw email body text.
 * Returns comma-separated string or null if nothing found.
 */
export function extractLastCargoesFromBody(body: string): string | null {
  if (!body) return null;

  for (const pattern of LC_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    const match = pattern.exec(body);
    if (match && match[1]) {
      // Clean up: trim, remove trailing punctuation, normalize horizontal whitespace
      let raw = match[1].trim();
      // Remove trailing period, semicolon
      raw = raw.replace(/[.;]+$/, '').trim();
      // Collapse horizontal whitespace only; preserve newlines so parseLastCargoes can split on them
      raw = raw.replace(/[^\S\n]+/g, ' ');
      // Skip if too short (likely false positive) or too long (likely grabbed too much)
      if (raw.length < 3 || raw.length > 500) continue;
      // Skip if it looks like a number-only match (not cargo names)
      if (/^\d+[\d,.\s]*$/.test(raw)) continue;
      return raw;
    }
  }
  return null;
}
