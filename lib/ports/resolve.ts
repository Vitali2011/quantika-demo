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
  byName: Map<string, PortEntry>;   // lowercase canonical name → entry
  byAlias: Map<string, PortEntry>;  // lowercase alias → entry
  entries: PortEntry[];
};

let _index: PortIndex | null = null;

function buildIndex(): PortIndex {
  if (_index) return _index;

  const ports = PORTS_JSON as PortEntry[];
  const byLocode = new Map<string, PortEntry>();
  const byName = new Map<string, PortEntry>();
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

    for (const alias of port.aliases ?? []) {
      const aliasLower = foldDiacritics(alias.toLowerCase());
      if (!byAlias.has(aliasLower)) {
        byAlias.set(aliasLower, port);
      }
    }
  }

  _index = { byLocode, byName, byAlias, entries: ports };
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
export function resolvePort(input: string): ResolvedPort | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const idx = buildIndex();

  // ── LOCODE path ─────────────────────────────────────────────────────────
  if (LOCODE_RE.test(trimmed)) {
    const locode = trimmed.toUpperCase();
    const entry = idx.byLocode.get(locode);
    if (entry) return toResolvedPort(entry);
    // Fall through to name search — 5-letter names like "Dubai" are possible
  }

  const lower = foldDiacritics(trimmed.toLowerCase());

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
export function resolvePortStrict(input: string): ResolvedPort {
  const result = resolvePort(input);
  if (!result) throw new PortNotFoundError(input);
  return result;
}
