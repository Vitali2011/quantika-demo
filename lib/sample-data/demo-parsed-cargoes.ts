/**
 * wave-γ-3-demo: pre-parsed cargo fixture loader.
 *
 * Reads the committed JSON fixture and resolves relative laycan offsets
 * (+Nd format) to absolute ISO date strings based on the seed `now` date.
 * Laycan resolution happens at SEED time (when /api/sample is called),
 * never at read time, so the 9 consumer sites remain untouched.
 */

import type { ParsedCargo } from '@/lib/types';
import fixtureRaw from './demo-parsed-cargoes.json';

/** Internal fixture shape — adds relative laycan fields, omits resolved laycan */
interface FixtureRecord extends Omit<ParsedCargo, 'laycan'> {
  laycanRelativeStart: string | null;
  laycanRelativeEnd: string | null;
}

/**
 * Parses "+Nd" offset string and adds N days to `base`.
 * Returns an ISO date string "YYYY-MM-DD".
 */
function resolveOffset(base: Date, offset: string): string {
  const match = /^\+(\d+)d$/.exec(offset);
  if (!match) throw new Error(`Invalid laycan offset: "${offset}"`);
  const days = parseInt(match[1], 10);
  const result = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return result.toISOString().slice(0, 10);
}

/**
 * Returns 4-5 pre-parsed cargoes with laycan dates resolved relative to `now`.
 * Safe to call multiple times — does not mutate the fixture JSON.
 */
export function resolveDemoParsedCargoes(now: Date): ParsedCargo[] {
  return (fixtureRaw as unknown as FixtureRecord[]).map((record) => {
    let laycan: string | null = null;

    if (record.laycanRelativeStart !== null && record.laycanRelativeEnd !== null) {
      const start = resolveOffset(now, record.laycanRelativeStart);
      const end = resolveOffset(now, record.laycanRelativeEnd);
      laycan = `${start} .. ${end}`;
    }

    // Destructure out the relative fields, spread the rest as ParsedCargo
     
    const { laycanRelativeStart, laycanRelativeEnd, ...rest } = record;

    return { ...rest, laycan } as ParsedCargo;
  });
}
