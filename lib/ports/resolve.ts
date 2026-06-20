/**
 * Unified port resolver — accepts UN/LOCODE (5-char) or free-text name/alias.
 *
 * Motivation: DA-lookup used LOCODE-only, war_risk used name-only, causing
 * each side to silently miss ports entered in the other format. This module
 * provides a single entry point so downstream consumers always receive a
 * normalized { portCode, portName } object regardless of input format.
 *
 * Lookup strategy:
 *   1. Trim + normalize input.
 *   2. If input matches /^[A-Za-z]{5}$/ → LOCODE lookup (case-insensitive).
 *   3. Otherwise → name lookup: exact match on `name` first, then alias exact
 *      match, then substring/partial match on name + aliases.
 *   4. Returns null when not found (never throws — use resolvePortStrict if
 *      you need an exception on missing ports).
 */

import PORTS_JSON from '@/data/ports/port-master.json';
import type { PortMaster } from '@/lib/sailing/port-master';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedPort {
  /** 5-char UN/LOCODE uppercase, e.g. "BEANR" */
  portCode: string;
  /** Canonical name, e.g. "Antwerp" */
  portName: string;
  /** ISO-3166 alpha-2 country code, e.g. "BE" */
  country: string;
  lat: number;
  lon: number;
  /** Alternative names (alt spellings, local names) */
  aliases: string[];
  /** Full PortMaster record for downstream consumers that need draft/crane data */
  master?: PortMaster;
}

/**
 * Optional disambiguation hint. Used ONLY to break homonym ties (ports that
 * share a folded name but have a different LOCODE/country — e.g. Cartagena
 * ESCAR/ES vs COCTG/CO, Tripoli LBKYE/LB vs LYTIP/LY). When omitted, resolution
 * stays exactly first-wins so there is zero regression on unambiguous names.
 */
export interface ResolveContext {
  /** Counterpart voyage port — its coords/country break the tie (nearest wins). */
  counterpart?: { lat?: number | null; lon?: number | null; country?: string | null } | null;
  /** Explicit ISO-3166 alpha-2 country hint (highest priority). */
  country?: string | null;
}

export class PortNotFoundError extends Error {
  constructor(input: string) {
    super(`Port not found: "${input}"`);
    this.name = 'PortNotFoundError';
  }
}

// ── Internal index ───────────────────────────────────────────────────────────

interface PortEntry {
  unlocode: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  aliases?: string[];
  maxDraftM: number;
  hasShoreCranes: boolean;
  berthType: 'river' | 'deep-sea' | 'bay' | 'terminal';
  [key: string]: unknown;
}

type PortIndex = {
  byLocode: Map<string, PortEntry>;
  byName: Map<string, PortEntry>;        // lowercase canonical name → first-wins entry
  byNameAll: Map<string, PortEntry[]>;   // lowercase canonical name → ALL same-name entries (homonyms)
  byAlias: Map<string, PortEntry>;       // lowercase alias → entry
  entries: PortEntry[];
};

let _index: PortIndex | null = null;

function buildIndex(): PortIndex {
  if (_index) return _index;

  const ports = PORTS_JSON as PortEntry[];
  const byLocode = new Map<string, PortEntry>();
  const byName = new Map<string, PortEntry>();
  const byNameAll = new Map<string, PortEntry[]>();
  const byAlias = new Map<string, PortEntry>();

  for (const port of ports) {
    if (!port.unlocode || !port.name) continue;

    const locode = port.unlocode.toUpperCase();
    byLocode.set(locode, port);

    const nameLower = foldDiacritics(port.name.toLowerCase());
    // Don't overwrite an earlier entry with a worse one (first-wins)
    if (!byName.has(nameLower)) {
      byName.set(nameLower, port);
    }
    // Keep EVERY same-name entry reachable for homonym tie-breaking. Insertion
    // order is preserved, so byNameAll.get(name)[0] === byName.get(name).
    const bucket = byNameAll.get(nameLower);
    if (bucket) bucket.push(port);
    else byNameAll.set(nameLower, [port]);

    for (const alias of port.aliases ?? []) {
      const aliasLower = foldDiacritics(alias.toLowerCase());
      if (!byAlias.has(aliasLower)) {
        byAlias.set(aliasLower, port);
      }
    }
  }

  _index = { byLocode, byName, byNameAll, byAlias, entries: ports };
  return _index;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LOCODE_RE = /^[A-Za-z]{5}$/;

/**
 * Fold combining diacritical marks so re-parsed native spellings match the
 * ASCII port-master entries: "Constanța"→"constanta", "Aliağa"→"aliaga",
 * "Giurgiulești"→"giurgiulesti". Applied consistently to both index keys and
 * lookup input. (Letters with no NFD decomposition — e.g. Turkish dotless "ı" —
 * are unaffected; those ports are handled by explicit aliases instead.)
 */
function foldDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/\p{Diacritic}/gu, '');
}

/** Great-circle distance (km) — only a relative ordering is needed for tie-break. */
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Break a homonym tie among `candidates` using the supplied context. Returns the
 * chosen entry, or null when the context carries no usable signal (caller then
 * falls back to first-wins). Priority:
 *   1. explicit `context.country` (unique case-insensitive match)
 *   2. counterpart coordinates → nearest candidate by great-circle distance
 *   3. counterpart country → unique case-insensitive match
 */
function pickHomonym(candidates: PortEntry[], context: ResolveContext): PortEntry | null {
  const byCountry = (iso: string | null | undefined): PortEntry | null => {
    if (!iso) return null;
    const want = iso.trim().toUpperCase();
    const hits = candidates.filter((c) => (c.country ?? '').toUpperCase() === want);
    return hits.length === 1 ? hits[0] : null;
  };

  // 1. Explicit country hint.
  const explicit = byCountry(context.country);
  if (explicit) return explicit;

  const cp = context.counterpart;
  if (cp) {
    // 2. Nearest to counterpart coordinates.
    if (typeof cp.lat === 'number' && typeof cp.lon === 'number') {
      let best: PortEntry | null = null;
      let bestKm = Infinity;
      for (const c of candidates) {
        if (typeof c.lat !== 'number' || typeof c.lon !== 'number') continue;
        const km = haversineKm(cp.lat, cp.lon, c.lat, c.lon);
        if (km < bestKm) {
          bestKm = km;
          best = c;
        }
      }
      if (best) return best;
    }
    // 3. Counterpart country match.
    const sameCountry = byCountry(cp.country);
    if (sameCountry) return sameCountry;
  }

  return null;
}

function toResolvedPort(entry: PortEntry): ResolvedPort {
  return {
    portCode: entry.unlocode.toUpperCase(),
    portName: entry.name,
    country: entry.country,
    lat: entry.lat,
    lon: entry.lon,
    aliases: entry.aliases ?? [],
    master: entry as unknown as PortMaster,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a port from any format: LOCODE ("BEANR") or name/alias ("Antwerp",
 * "Antwerpen", "Rotterdam"). Returns null when the port cannot be found.
 */
export function resolvePort(input: string, context?: ResolveContext): ResolvedPort | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const idx = buildIndex();

  // ── LOCODE path ─────────────────────────────────────────────────────────
  // A LOCODE is unique, so it is inherently homonym-free — context is ignored.
  if (LOCODE_RE.test(trimmed)) {
    const locode = trimmed.toUpperCase();
    const entry = idx.byLocode.get(locode);
    if (entry) return toResolvedPort(entry);
    // Fall through to name search — 5-letter names like "Dubai" are possible
  }

  const lower = foldDiacritics(trimmed.toLowerCase());

  // ── Homonym tie-break ───────────────────────────────────────────────────
  // Only when a context hint is supplied AND the folded name collides across
  // multiple ports. No hint → skip entirely and keep exact first-wins below.
  if (context) {
    const candidates = idx.byNameAll.get(lower);
    if (candidates && candidates.length > 1) {
      const picked = pickHomonym(candidates, context);
      if (picked) return toResolvedPort(picked);
    }
  }

  // ── Exact name match ────────────────────────────────────────────────────
  const byName = idx.byName.get(lower);
  if (byName) return toResolvedPort(byName);

  // ── Exact alias match ───────────────────────────────────────────────────
  const byAlias = idx.byAlias.get(lower);
  if (byAlias) return toResolvedPort(byAlias);

  // ── Partial / substring match on name ───────────────────────────────────
  // Prefer entries where the input appears at the start of the name
  let bestEntry: PortEntry | undefined;

  for (const entry of idx.entries) {
    const nameLower = foldDiacritics(entry.name.toLowerCase());
    if (nameLower.includes(lower) || lower.includes(nameLower)) {
      bestEntry = entry;
      if (nameLower.startsWith(lower) || lower.startsWith(nameLower)) break; // good enough
    }
  }

  if (bestEntry) return toResolvedPort(bestEntry);

  // ── Partial alias match ─────────────────────────────────────────────────
  for (const entry of idx.entries) {
    for (const alias of entry.aliases ?? []) {
      const aliasLower = foldDiacritics(alias.toLowerCase());
      if (aliasLower.includes(lower) || lower.includes(aliasLower)) {
        return toResolvedPort(entry);
      }
    }
  }

  return null;
}

/**
 * Like resolvePort() but throws PortNotFoundError instead of returning null.
 * Useful in strict contexts where a missing port is a programming error.
 */
export function resolvePortStrict(input: string, context?: ResolveContext): ResolvedPort {
  const result = resolvePort(input, context);
  if (!result) throw new PortNotFoundError(input);
  return result;
}
