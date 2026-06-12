/**
 * charterer-extract.ts — shared charterer-name extraction + backfill transform
 * for the demo-seed corpus (audit A.1).
 *
 * Used by seed-charterers.ts (fixture discovery) and backfill-charterer.ts
 * (parsed_results chartererName backfill). Kept in one module so the two
 * scripts can never diverge on the regex.
 *
 * Tuned against the real demo corpus (data/demo-seed.db emails):
 *   - "- ACCT:  GRAIN TRADER A"            → colon-labelled form
 *   - "-CHARTERERS : GRAIN TRADER A"       → colon-labelled form
 *   - "Acct: huaya"                        → colon-labelled form
 *   - "Account Messers GRAIN TRADER B"     → bare-account form
 * while rejecting CP boilerplate like "CHARTERERS ACCOUNT AT BOTH ENDS",
 * "CHRTS ACCT AND TIME TO COUNT AS LAYTIME", "FULL FREIGHT IN THEIR BANK ACCOUNT".
 */

/** Label + colon, name on the same line: "ACCT: X", "Charterers : X", "Account: X". */
export const CHARTERER_COLON_RE =
  /\b(?:acct|account|chrts|chtrs|charterers?)\.?[ \t]*:[ \t]*([A-Za-z][A-Za-z0-9 .&'-]{2,40})/gi;

/** Bare "Account [Messers] X" form (fixture-recap style). Guarded by STOPWORDS below. */
export const CHARTERER_ACCOUNT_RE =
  /\baccount[ \t]+(?:messe?rs\.?[ \t]+)?([A-Za-z][A-Za-z0-9 .&'-]{2,40})/gi;

/** First-token stopwords: a capture starting with one of these is CP boilerplate, not a name. */
const STOPWORDS = new Set([
  'at', 'and', 'of', 'to', 'the', 'their', 'for', 'in', 'on', 'by', 'or',
  'is', 'are', 'as', 'with', 'no', 'any', 'if', 'shall', 'will', 'be',
  'time', 'messers', 'messrs', 'tba', 'tbn', 'tbd',
]);

export type ParsedItem = Record<string, unknown>;

/** Same normalization as lib/matching/charterer-tier.ts — dedupe key + lookup parity. */
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Clean a raw regex capture into a charterer name, or null when it is noise:
 * cut at column-style runs of whitespace, strip trailing punctuation,
 * collapse inner whitespace, reject stopword-led or too-short captures.
 */
function cleanCapturedName(raw: string): string | null {
  let s = raw.split(/\s{2,}/)[0];
  s = s.replace(/[\s.&'-]+$/, '').replace(/\s+/g, ' ').trim();
  if (s.length < 3) return null;
  const firstToken = s.split(' ')[0].toLowerCase();
  if (STOPWORDS.has(firstToken)) return null;
  return s;
}

/**
 * Extract charterer names from an email body, in order of appearance,
 * deduped case-insensitively (first-seen form wins).
 */
export function extractChartererNames(body: string): string[] {
  if (!body) return [];
  const found: { index: number; name: string }[] = [];
  for (const re of [CHARTERER_COLON_RE, CHARTERER_ACCOUNT_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const name = cleanCapturedName(m[1]);
      if (name) found.push({ index: m.index, name });
    }
  }
  found.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of found) {
    const key = normalizeKey(f.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(f.name);
  }
  return out;
}

/** First extracted charterer name, or null. */
export function extractChartererName(body: string): string | null {
  return extractChartererNames(body)[0] ?? null;
}

/**
 * Mutates `items` in place: sets `chartererName` on every item where it is
 * null or absent. Items with an existing non-null value are left untouched,
 * so a second run patches 0 items (idempotent).
 */
export function applyChartererPatch(items: ParsedItem[], chartererName: string): { patched: number } {
  let patched = 0;
  for (const item of items) {
    if (item['chartererName'] === null || item['chartererName'] === undefined) {
      item['chartererName'] = chartererName;
      patched++;
    }
  }
  return { patched };
}

/**
 * Patch a parsed_results.result_json payload, preserving its root shape
 * (JSON array of items, or a single bare item object — both occur historically;
 * same convention as regenerate-matches.ts `Array.isArray(raw) ? raw : [raw]`).
 */
export function patchResultJson(resultJson: string, chartererName: string): { json: string; patched: number } {
  const raw: unknown = JSON.parse(resultJson);
  const isArray = Array.isArray(raw);
  const items = (isArray ? raw : [raw]) as ParsedItem[];
  const { patched } = applyChartererPatch(items, chartererName);
  return { json: JSON.stringify(isArray ? items : items[0]), patched };
}
