import { createSession, updateSession } from '@/lib/session';
import { now } from '@/lib/clock';
import { rebaseDates } from './rebase';
import {
  resolveDemoParsedCargoes,
  resolveDemoClassifications,
  resolveDemoParsedVessels,
  resolveDemoProcessedEmails,
} from './demo-parsed-cargoes';
import type { SampleEmailRaw } from './types';
import type { Match } from '@/lib/types';
import cargoInquiries from './cargo-inquiries.json';
import vesselPositions from './vessel-positions.json';
import fixtureRecaps from './fixture-recaps.json';
import clientReplies from './client-replies.json';
import documents from './documents.json';
import vesselCerts from './vessel-certs.json';

const DEMO_ECONOMICS_MATCH: Match = {
  cargoEmailId: 'demo-cargo-economics',
  cargoItemIndex: 0,
  vesselEmailId: 'demo-vessel-economics',
  vesselItemIndex: 0,
  score: 92,
  matchLevel: 'good',
  matchReasons: ['Good DWT fit — 58,000 mt vessel vs 50,000 mt grain cargo'],
  issues: [],
};

// Demo seed: pairs for the «На проверку» tab — weak score or idle vessel with
// large date gap. Uses corpus emailIds so toBucketRows can enrich with port/DWT.
const DEMO_LOW_CONFIDENCE_MATCHES: Match[] = [
  {
    cargoEmailId: '19d5dea61d04209f',
    cargoItemIndex: 0,
    vesselEmailId: '19d5e7406f50cc13',
    vesselItemIndex: 0,
    score: 52,
    matchLevel: 'weak',
    matchReasons: ['Vessel at Marmara — long ballast to Suez load port; score below review threshold'],
    issues: ['geographic proximity low'],
  },
  {
    cargoEmailId: '19d5def0bf1a5c3f',
    cargoItemIndex: 0,
    vesselEmailId: '19d5e75a1f9011b6',
    vesselItemIndex: 0,
    score: 58,
    matchLevel: 'weak',
    matchReasons: ['Idle vessel at Biscay — date gap exceeds 21-day idle threshold'],
    issues: ['idle gap too large'],
  },
];

// Demo seed: pairs for the «Мало данных» tab — unknown verdict, vague ports or
// missing dates. Uses corpus emailIds so toBucketRows can enrich where possible.
const DEMO_INSUFFICIENT_DATA: Match[] = [
  {
    cargoEmailId: '19d5e75f7c50d8e8',
    cargoItemIndex: 0,
    vesselEmailId: '19d5e74e4479a895',
    vesselItemIndex: 0,
    score: 30,
    matchLevel: 'weak',
    matchReasons: ['Load port vague — "Egypt Mediterranean port (unspecified)"; cannot compute ballast distance'],
    issues: ['load port unspecified'],
  },
  {
    cargoEmailId: '19d5def0bf1a5c3f',
    cargoItemIndex: 0,
    vesselEmailId: '19d5e74e4479a895',
    vesselItemIndex: 0,
    score: 25,
    matchLevel: 'weak',
    matchReasons: ['Laycan "Cargo ready" — no specific date range; distance and TCE not computable'],
    issues: ['laycan not parseable'],
  },
];

const SAMPLE_EMAILS_RAW: SampleEmailRaw[] = [
  ...(cargoInquiries as unknown as SampleEmailRaw[]),
  ...(vesselPositions as unknown as SampleEmailRaw[]),
  ...(fixtureRecaps as unknown as SampleEmailRaw[]),
  ...(clientReplies as unknown as SampleEmailRaw[]),
  ...(documents as unknown as SampleEmailRaw[]),
  ...(vesselCerts as unknown as SampleEmailRaw[]),
];

/**
 * Creates a new demo session seeded with sample freight emails and pre-parsed data.
 * Returns the session ID. Call only when DEMO_MODE=true.
 */
export function createDemoSession(): string {
  const sessionId = createSession('sample-data-token');
  // Frozen demo clock (lib/clock) — NOT new Date(). Unifies session-init rebasing with
  // the match engine so synthesized laycans match the engine's "now" (#1024) and
  // downstream consumers (quote prompt, freshness) share one clock (#1018). Outside
  // DEMO_MODE now() returns real time, so production behaviour is unchanged.
  const today = now();
  const emails = rebaseDates(SAMPLE_EMAILS_RAW, today);
  const parsedCargos = resolveDemoParsedCargoes(today);
  const classifications = resolveDemoClassifications();
  const parsedVessels = resolveDemoParsedVessels(today);
  const processedEmails = resolveDemoProcessedEmails(today, emails);
  updateSession(sessionId, {
    emails,
    isSampleData: true,
    parsedCargos,
    classifications,
    parsedVessels,
    processedEmails,
    matches: [DEMO_ECONOMICS_MATCH],
    lowConfidenceMatches: DEMO_LOW_CONFIDENCE_MATCHES,
    insufficientData: DEMO_INSUFFICIENT_DATA,
  });
  return sessionId;
}
