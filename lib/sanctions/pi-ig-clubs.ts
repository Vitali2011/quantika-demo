export const PI_IG_CLUBS = [
  'Gard', 'UK', 'North', 'Skuld', 'Britannia', 'Steamship Mutual',
  'West', 'American', 'Japan', 'London', 'Shipowners', 'Standard', 'Swedish',
] as const;
export type IgClub = typeof PI_IG_CLUBS[number];

export function isIgClub(clubName: string): boolean {
  if (!clubName) return false;
  const lower = clubName.toLowerCase().trim();
  return PI_IG_CLUBS.some(club => lower.startsWith(club.toLowerCase()));
}
