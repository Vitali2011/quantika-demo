/**
 * Normalizes entity names for matching across sanctions lists.
 * Shared utility for OFAC, EU, and other sanctions parsers.
 *
 * Input contract:
 * - Empty string: returns ""
 * - null/undefined: TypeScript type guard prevents
 * - Diacritics: NFD decomposed + stripped
 * - Null bytes (\0): replaced with space
 * - Non-alphanumeric: replaced with space
 * - Multiple spaces: collapsed to single space
 * - Leading/trailing spaces: trimmed
 */
export function normalizeName(name: string): string {
  return (
    name
      .toLowerCase()
      // Handle special characters that don't normalize via NFD
      .replace(/ł/g, "l")
      .replace(/ø/g, "o")
      .replace(/đ/g, "d")
      .replace(/ð/g, "d")
      .replace(/þ/g, "th")
      .replace(/ß/g, "ss")
      .replace(/æ/g, "ae")
      .replace(/œ/g, "oe")
      // NFD normalization for most diacritics
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove combining diacritical marks
      .replace(/\x00/g, " ") // null bytes → space
      .replace(/[^a-z0-9\s]/g, " ") // non-alphanumeric → space
      .replace(/\s+/g, " ") // collapse multiple spaces
      .trim()
  );
}
