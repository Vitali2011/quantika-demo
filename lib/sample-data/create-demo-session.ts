import { createSession, updateSession } from '@/lib/session';
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
  const today = new Date();
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
  });
  return sessionId;
}
