export const IACS_MEMBERS = ['DNV', 'LR', 'ABS', 'BV', 'NKK', 'KR', 'CCS', 'RINA'] as const;
export type IacsMember = typeof IACS_MEMBERS[number];

const ALIASES: Record<string, IacsMember> = {
  'dnv gl': 'DNV',
  'det norske veritas': 'DNV',
  "lloyd's register": 'LR',
  'lloyds register': 'LR',
  'american bureau of shipping': 'ABS',
  'bureau veritas': 'BV',
  'nippon kaiji kyokai': 'NKK',
  'klasnk': 'KR',
  'korean register': 'KR',
  'korean register of shipping': 'KR',
  'china classification society': 'CCS',
  'registro italiano navale': 'RINA',
};

export function isIacs(className: string): boolean {
  if (!className) return false;
  const lower = className.toLowerCase().trim();
  if (IACS_MEMBERS.some(m => m.toLowerCase() === lower)) return true;
  return lower in ALIASES;
}
