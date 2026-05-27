/**
 * Abbreviate a port name to a short display code (4 chars max, uppercase).
 *
 * Rules:
 * 1. If the input is already a ≤5-char all-caps code (e.g. "NLRTM"), return as-is.
 * 2. Strip parenthetical qualifiers — "(Ukraine)", "(US Gulf)", "(Turkey)" — before
 *    abbreviating. Without stripping, the split on whitespace leaves "(Ukraine)" as a
 *    single token whose first char "(" propagates into the display code (bug #516).
 * 3. Single-word name → first 4 chars.
 * 4. Multi-word name → first letter of each word, up to 4.
 */
export function abbrPort(port: string): string {
  if (!port) return '';
  // Fast-path: already a short all-caps code (UNLOCODE or similar).
  if (port.length <= 5 && port === port.toUpperCase()) return port;
  // Strip parenthetical qualifiers before splitting.
  const clean = port.replace(/\s*\([^)]*\)/g, '').trim();
  const normalized = clean || port.trim();
  // Re-check fast-path after stripping (e.g. "NLRTM" embedded in a qualifier).
  if (normalized.length <= 5 && normalized === normalized.toUpperCase()) return normalized;
  const words = normalized.split(/[\s,/\-]+/).filter(Boolean);
  if (words.length === 1) return normalized.slice(0, 4).toUpperCase();
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
}
