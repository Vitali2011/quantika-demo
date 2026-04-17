/**
 * Target-list matcher: maps curated PortTarget entries to parsed UN/LOCODE
 * rows, producing skeleton port-master records (no LLM-enriched fields yet).
 *
 * Match priority (per target):
 *   1. explicit unlocode override (target.unlocode === row.unlocode)
 *   2. name + country normalized exact match
 *   3. country match + alias-list overlap
 *   4. unmatched (added to warnings)
 *
 * Canonical name from the target is preserved over the raw UN/LOCODE name —
 * UN/LOCODE often appends "Pt" / "Pulau" / oblique transliterations that
 * brokers don't type ("Shanghai Pt" → "Shanghai").
 */

import type { ParsedUnlocodeRow } from './unlocode-parse';
import type { PortTarget } from '../port-targets';

/** Skeleton port-master shape (no LLM fields yet — those land in Phase 4). */
export interface SkeletonPort {
  unlocode: string;
  name: string;
  country: string;
  /** Coords are null when neither UN/LOCODE CSV nor target override has them.
   *  Phase 4 LLM enrichment fills these in from authoritative sources. */
  lat: number | null;
  lon: number | null;
}

export interface MatchResult {
  matched: SkeletonPort[];
  unmatched: PortTarget[];
  warnings: string[];
}

/**
 * Normalize a string for matching: strip diacritics, lowercase, drop common
 * port-prefix words, collapse whitespace, drop trailing parentheticals.
 */
export function normalizeForMatch(s: string): string {
  let out = s
    // Strip combining diacritics (NFD then drop \p{M})
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Collapse whitespace + trim FIRST so anchors and prefix/suffix regexes work.
  out = out.replace(/\s+/g, ' ').trim();

  // Drop trailing parentheticals: "Cartagena (CO)" → "Cartagena"
  out = out.replace(/\s*\([^)]*\)\s*$/, '').trim();

  // Drop UN/LOCODE noise suffixes: "shanghai pt" → "shanghai"
  out = out.replace(/\s+(pt|pte|pulau|cidade|porto|po|harbor|harbour)\.?$/i, '').trim();

  // Strip port-prefix words: "Port of Rotterdam" / "Pt. Klang" / "Saint X"
  out = out.replace(/^(port of|port|pt\.?|saint|st\.?|the)\s+/i, '').trim();

  return out;
}

export function matchTargetsToUnlocodes(
  targets: PortTarget[],
  rows: ParsedUnlocodeRow[],
): MatchResult {
  // Build indexes once.
  const byUnlocode = new Map<string, ParsedUnlocodeRow>();
  const byCountryName = new Map<string, ParsedUnlocodeRow[]>();
  for (const r of rows) {
    byUnlocode.set(r.unlocode.toUpperCase(), r);
    const key = `${r.country.toUpperCase()}|${normalizeForMatch(r.name)}`;
    const list = byCountryName.get(key) ?? [];
    list.push(r);
    byCountryName.set(key, list);
  }

  const matched: SkeletonPort[] = [];
  const unmatched: PortTarget[] = [];
  const warnings: string[] = [];
  const seenUnlocodes = new Set<string>();

  for (const t of targets) {
    let row: ParsedUnlocodeRow | undefined;

    // 1. Explicit UNLOCODE override
    if (t.unlocode) {
      row = byUnlocode.get(t.unlocode.toUpperCase());
      if (!row) {
        warnings.push(`Target "${t.name}" (${t.country}) overrides unlocode ${t.unlocode} but it is not in UN/LOCODE rows`);
      }
    }

    // 2. Name + country exact match
    if (!row) {
      const key = `${t.country.toUpperCase()}|${normalizeForMatch(t.name)}`;
      const candidates = byCountryName.get(key) ?? [];
      if (candidates.length === 1) {
        row = candidates[0];
      } else if (candidates.length > 1) {
        // Prefer the one whose UNLOCODE last 3 chars roughly match the name
        // (heuristic: NLRTM = Rotterdam, NLAMS = Amsterdam etc.)
        const nameStart = normalizeForMatch(t.name).slice(0, 3).toUpperCase();
        row = candidates.find(c => c.unlocode.endsWith(nameStart)) ?? candidates[0];
        warnings.push(`Target "${t.name}" (${t.country}) is ambiguous (${candidates.length} candidates); picked ${row.unlocode}`);
      }
    }

    // 3. Alias match within same country
    if (!row && t.aliases) {
      for (const alias of t.aliases) {
        const key = `${t.country.toUpperCase()}|${normalizeForMatch(alias)}`;
        const candidates = byCountryName.get(key) ?? [];
        if (candidates.length >= 1) {
          row = candidates[0];
          break;
        }
      }
    }

    if (!row) {
      unmatched.push(t);
      continue;
    }

    if (seenUnlocodes.has(row.unlocode)) {
      warnings.push(`Duplicate UNLOCODE ${row.unlocode} from target "${t.name}" (${t.country}) — already matched`);
      continue;
    }
    seenUnlocodes.add(row.unlocode);

    matched.push({
      unlocode: row.unlocode,
      name: t.name,           // canonical from target — broker-facing
      country: row.country,
      // Coordinate priority: target override > CSV row > null (LLM-fill later).
      lat: t.lat ?? row.lat,
      lon: t.lon ?? row.lon,
    });
  }

  return { matched, unmatched, warnings };
}
