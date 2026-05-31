import { checkCompatibility, parseLastCargoes } from '@/lib/cargo/l5c-matrix';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

/**
 * Applies hold cleanliness check (L5C-matrix) to a match in-place.
 *
 * - compatible=false → adds issue + demotes confidence to uncertain/blockSend
 * - requires_extra_clean (compatible) → adds caution issue, no confidence change
 * - no-ops when vessel.lastCargoes or cargo.cargoDescription is absent
 */
export function applyHoldCleanliness(
  m: Match,
  cargo: ParsedCargo,
  vessel: ParsedVessel,
): void {
  const cargoName = cargo.cargoDescription?.value;
  if (!cargoName || !vessel.lastCargoes) return;

  const prevCargoes = parseLastCargoes(vessel.lastCargoes);
  if (prevCargoes.length === 0) return;

  const compat = checkCompatibility(prevCargoes, cargoName);

  if (!compat.compatible) {
    const blockers = compat.blocking_pairs.map((p) => p.previous).join(', ');
    m.issues = [
      ...(m.issues ?? []),
      `Hold cleanliness: incompatible with last cargo (${blockers})`,
    ];
    if (m.confidence) {
      m.confidence = { ...m.confidence, level: 'uncertain', blockSend: true };
    }
  } else if (compat.requires_extra_clean) {
    m.issues = [...(m.issues ?? []), 'Hold cleanliness: extra cleaning required (caution)'];
  }
}
