/**
 * wave-γ-3-demo: pre-parsed cargo fixture loader.
 *
 * Reads the committed JSON fixture and resolves relative laycan offsets
 * (+Nd format) to absolute ISO date strings based on the seed `now` date.
 * Laycan resolution happens at SEED time (when /api/sample is called),
 * never at read time, so the 9 consumer sites remain untouched.
 *
 * wave-γ-1.5-A: extended with resolveDemoClassifications,
 * resolveDemoParsedVessels, and resolveDemoProcessedEmails.
 */

import type { ParsedCargo, Classification, ParsedVessel, ProcessedEmail, Email } from '@/lib/types';
import { buildProcessedEmails } from '@/lib/classification-service';
import fixtureRaw from './demo-parsed-cargoes.json';
import classificationsFixture from './demo-classifications.json';
import vesselsFixtureRaw from './demo-parsed-vessels.json';

/** Internal fixture shape — adds relative laycan fields, omits resolved laycan */
interface FixtureRecord extends Omit<ParsedCargo, 'laycan'> {
  laycanRelativeStart: string | null;
  laycanRelativeEnd: string | null;
}

/** Internal vessel fixture shape — openDate is stored as relative offset */
interface VesselFixtureRecord extends Omit<ParsedVessel, 'openDate'> {
  openDateRelative: string | null;
}

/**
 * Parses "+Nd" offset string and adds N days to `base`.
 * Returns an ISO date string "YYYY-MM-DD".
 */
function resolveOffset(base: Date, offset: string): string {
  const match = /^\+(\d+)d$/.exec(offset);
  if (!match) throw new Error(`Invalid offset: "${offset}"`);
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

/**
 * Returns 32 pre-seeded classifications — one per sample email.
 * No date resolution needed: classifications have no date-relative fields.
 * Safe to call multiple times — does not mutate the fixture JSON.
 */
export function resolveDemoClassifications(): Classification[] {
  return classificationsFixture as unknown as Classification[];
}

/**
 * Returns 9 pre-parsed vessel positions with openDate resolved relative to `now`.
 * Safe to call multiple times — does not mutate the fixture JSON.
 */
export function resolveDemoParsedVessels(now: Date): ParsedVessel[] {
  return (vesselsFixtureRaw as unknown as VesselFixtureRecord[]).map((record) => {
    let openDate: ParsedVessel['openDate'] = null;

    if (record.openDateRelative !== null && record.openDateRelative !== undefined) {
      const resolved = resolveOffset(now, record.openDateRelative);
      openDate = { value: resolved, confidence: 'confirmed' };
    }

    const { openDateRelative, ...rest } = record;

    return { ...rest, openDate } as ParsedVessel;
  });
}

/**
 * Returns ProcessedEmail[] built from pre-seeded classifications + parsed arrays.
 * Delegates to buildProcessedEmails (lib/classification-service.ts:81) — pure function.
 * Accepts `emails` so freshness / expiryDate can be derived from email.date.
 */
export function resolveDemoProcessedEmails(
  now: Date,
  emails: Email[],
): ProcessedEmail[] {
  const classifications = resolveDemoClassifications();
  const parsedCargos = resolveDemoParsedCargoes(now);
  const parsedVessels = resolveDemoParsedVessels(now);
  return buildProcessedEmails(emails, classifications, parsedCargos, parsedVessels);
}
