export const PI_IG_CLUBS = [
  'Gard', 'UK', 'North', 'Skuld', 'Britannia', 'Steamship Mutual',
  'West', 'American', 'Japan', 'London', 'Shipowners', 'Standard', 'Swedish',
] as const;
export type IgClub = typeof PI_IG_CLUBS[number];

// Name variants → canonical club. Mirrors the exact-name + alias approach in
// lib/sanctions/iacs-members.ts. Keys are already normalized (lowercase, with
// the leading "the " and trailing P&I/Club suffixes stripped) — see normalize().
const ALIASES: Record<string, IgClub> = {
  'north of england': 'North',
  'north standard': 'North',
  'west of england': 'West',
};

// Stripped before matching so "The North of England P&I Club" → "north of england".
// NOT including "mutual" — "Steamship Mutual" is a canonical club name.
const SUFFIXES = [
  ' protection and indemnity',
  ' p&i club',
  ' p & i club',
  ' p&i',
  ' p & i',
  ' club',
];

function normalize(name: string): string {
  let s = name.toLowerCase().trim();
  if (s.startsWith('the ')) s = s.slice(4).trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of SUFFIXES) {
      if (s.endsWith(suf)) {
        s = s.slice(0, -suf.length).trim();
        changed = true;
      }
    }
  }
  return s;
}

/**
 * True when `clubName` is (a variant of) an International Group P&I club.
 *
 * Exact-name + alias matching (not prefix startsWith): startsWith over-matched
 * non-IG names sharing a prefix ("Standard Chartered" → Standard) AND missed
 * legit variants behind a "The " prefix ("The North of England"). Both fixed here.
 */
export function isIgClub(clubName: string): boolean {
  if (!clubName) return false;
  const norm = normalize(clubName);
  if (!norm) return false;
  if (PI_IG_CLUBS.some(club => club.toLowerCase() === norm)) return true;
  return norm in ALIASES;
}
