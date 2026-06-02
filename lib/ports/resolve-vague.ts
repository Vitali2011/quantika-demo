/**
 * Vague-port resolver (Variant A, founder Gate5 2026-06-02).
 *
 * Re-parsed broker emails carry vague discharge/load descriptors with no single
 * named port — "East Coast Greece port (unspecified)", "1 safe port Sweden",
 * "Western Mediterranean (1 port)". These never resolve via `resolvePort` →
 * `port_not_found` → the Voyage P&L renders a red error.
 *
 * Founder decision: resolve such a descriptor to a REPRESENTATIVE basin port so
 * P&L computes with an approximate distance, and flag `approximate: true` so the
 * UI can show an amber "approximate port — confirm" note (NOT a silent guess).
 *
 * Genuinely-unknown descriptors ("TBS", "Port of Call (unspecified)") return
 * null — the caller shows "port to be confirmed, P&L pending" rather than
 * fabricating a location.
 */
import { resolvePort, type ResolvedPort } from './resolve';

export interface VagueResolution extends ResolvedPort {
  /** Marks the port as an approximation of a vague descriptor — drives the amber UI note. */
  approximate: true;
}

// Genuinely unknown — no representative is defensible.
const UNKNOWN_RE = /\b(tbs|to\s+be\s+specified|port\s+of\s+call|unnamed)\b/i;

// Ordered keyword → representative port (first match wins). Each target is a real
// port-master entry (verified). Order matters: more-specific phrases precede
// broader country keywords (e.g. "eastern mediterranean" before "turkey").
const VAGUE_MAP: Array<[RegExp, string]> = [
  [/east\s+coast\s+greece|\bgreece\b/i, 'Thessaloniki'],
  [/\begypt\b/i, 'Alexandria'],
  [/\bcyprus\b/i, 'Limassol'],
  [/central\s+mediterranean/i, 'Augusta'],
  [/western\s+mediterranean|spanish\s+mediterranean/i, 'Barcelona'],
  [/eastern\s+mediterranean/i, 'Iskenderun'],
  [/east\s+coast\s+italy/i, 'Ravenna'],
  [/\bsweden\b/i, 'Gothenburg'],
  [/united\s+kingdom|\buk\b/i, 'Liverpool'],
  [/\bturkey\b|turkish/i, 'Istanbul'],
  [/european\s+continent|ara\s+range|\bara\b/i, 'Rotterdam'],
];

/**
 * Resolve a vague descriptor to a representative basin port (approximate:true),
 * or null when no defensible representative exists.
 */
export function resolveVaguePort(input: string | null | undefined): VagueResolution | null {
  if (!input || !input.trim()) return null;
  if (UNKNOWN_RE.test(input)) return null;
  for (const [re, rep] of VAGUE_MAP) {
    if (re.test(input)) {
      const r = resolvePort(rep);
      if (r) return { ...r, approximate: true };
    }
  }
  return null;
}
