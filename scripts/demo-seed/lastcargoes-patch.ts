/**
 * lastcargoes-patch.ts — backfill transform for parsed_results lastCargoes
 * (audit D revive).
 *
 * Used by backfill-lastcargoes.ts. Extraction itself lives in
 * lib/parsing/lastcargoes-fallback.ts (shared with the live normalizer in
 * parse-vessel-helpers.ts) so the backfill and the parser can never diverge
 * on the regex. Mirrors charterer-extract.ts patch conventions.
 */

export type ParsedItem = Record<string, unknown>;

/**
 * Mutates `items` in place: sets `lastCargoes` on every item where it is
 * null or absent. Items with an existing non-null value are left untouched,
 * so a second run patches 0 items (idempotent).
 */
export function applyLastCargoesPatch(items: ParsedItem[], lastCargoes: string): { patched: number } {
  let patched = 0;
  for (const item of items) {
    if (item['lastCargoes'] === null || item['lastCargoes'] === undefined) {
      item['lastCargoes'] = lastCargoes;
      patched++;
    }
  }
  return { patched };
}

/**
 * Patch a parsed_results.result_json payload, preserving its root shape
 * (JSON array of items, or a single bare item object — both occur historically;
 * same convention as charterer-extract.ts patchResultJson).
 */
export function patchResultJsonLastCargoes(resultJson: string, lastCargoes: string): { json: string; patched: number } {
  const raw: unknown = JSON.parse(resultJson);
  const isArray = Array.isArray(raw);
  const items = (isArray ? raw : [raw]) as ParsedItem[];
  const { patched } = applyLastCargoesPatch(items, lastCargoes);
  return { json: JSON.stringify(isArray ? items : items[0]), patched };
}
