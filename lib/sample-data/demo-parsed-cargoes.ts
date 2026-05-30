/**
 * Pre-parsed cargo / vessel / classification fixture loader for the demo
 * (POST /api/sample). After the ETMS corpus migration (2026-05-14) the JSON
 * fixtures hold corpus-derived records with ABSOLUTE laycan / openDate values
 * (real LLM output against frozen email bodies).
 *
 * Wave A (2026-05-30): the corpus resolvers now REBASE those absolute dates onto
 * `now` (lib/sample-data/rebase-parsed.ts), preserving each set's internal spread
 * so demo match counts stay stable across run dates (was drifting 1418 → 67 as
 * laycans expired). Spot/prompt and display=TODAY values resolve to `now`.
 *
 * The two synthetic economics-matching records (lib/sample-data/synthetic-economics.ts)
 * are appended at seed-time with their own relative offsets so the EconomicsTab
 * demo always has a future laycan and a fresh openDate.
 */

import type {
  ParsedCargo,
  Classification,
  ParsedVessel,
  ProcessedEmail,
  Email,
} from '@/lib/types';
import { buildProcessedEmails } from '@/lib/classification-service';
import { resolveSyntheticCargo, resolveSyntheticVessel } from './synthetic-economics';
import { rebaseParsedCargoes, rebaseParsedVessels } from './rebase-parsed';
import cargoesFixture from './demo-parsed-cargoes.json';
import classificationsFixture from './demo-classifications.json';
import vesselsFixture from './demo-parsed-vessels.json';

/**
 * Pre-parsed cargoes: corpus-derived records from the JSON fixture
 * (laycan stored as absolute YYYY-MM-DD..YYYY-MM-DD or null) plus one
 * synthetic economics-match record resolved relative to `now`.
 */
export function resolveDemoParsedCargoes(now: Date): ParsedCargo[] {
  const corpus = cargoesFixture as unknown as ParsedCargo[];
  return [...rebaseParsedCargoes(corpus, now), resolveSyntheticCargo(now)];
}

/**
 * Pre-seeded classifications, one per sample email. No date resolution.
 */
export function resolveDemoClassifications(): Classification[] {
  return classificationsFixture as unknown as Classification[];
}

/**
 * Pre-parsed vessel positions: corpus-derived records (openDate absolute
 * or null) plus one synthetic economics-match vessel resolved relative
 * to `now`.
 */
export function resolveDemoParsedVessels(now: Date): ParsedVessel[] {
  const corpus = vesselsFixture as unknown as ParsedVessel[];
  return [...rebaseParsedVessels(corpus, now), resolveSyntheticVessel(now)];
}

/**
 * Derived ProcessedEmail[] for the dashboard. Pure delegation to
 * buildProcessedEmails — keeps freshness logic centralised.
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
