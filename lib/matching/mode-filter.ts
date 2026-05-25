import type { StoredMatch } from './matches-repository';

export function filterMatchesByMode(
  matches: StoredMatch[],
  isOwner: boolean,
  cargoEmailIds: string[],
  vesselEmailIds: string[],
): StoredMatch[] {
  if (isOwner && vesselEmailIds.length > 0) {
    return matches.filter((m) => vesselEmailIds.includes(m.vessel_id));
  }
  if (!isOwner && cargoEmailIds.length > 0) {
    return matches.filter((m) => cargoEmailIds.includes(m.cargo_id));
  }
  return matches;
}
