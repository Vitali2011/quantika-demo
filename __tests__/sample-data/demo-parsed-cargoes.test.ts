/**
 * Unit tests for the demo sample-data resolvers (post ETMS-corpus migration).
 *
 * Pre-migration the corpus was 32 hand-curated 'sample-NN' emails with
 * tightly hardcoded counts. After migration the fixtures are regenerated
 * from .private/etms-corpus.json (154 real broker emails), so these tests
 * derive their expectations from the committed fixtures instead of pinning
 * specific IDs or counts. Two synthetic 'demo-economics' records are
 * appended by the resolvers at seed-time and ARE pinned (they're not from
 * the corpus, they live in lib/sample-data/synthetic-economics.ts).
 */

import {
  resolveDemoParsedCargoes,
  resolveDemoClassifications,
  resolveDemoParsedVessels,
  resolveDemoProcessedEmails,
} from '@/lib/sample-data/demo-parsed-cargoes';
import cargoInquiries from '@/lib/sample-data/cargo-inquiries.json';
import vesselPositions from '@/lib/sample-data/vessel-positions.json';
import fixtureRecaps from '@/lib/sample-data/fixture-recaps.json';
import clientReplies from '@/lib/sample-data/client-replies.json';
import documents from '@/lib/sample-data/documents.json';
import vesselCerts from '@/lib/sample-data/vessel-certs.json';
import type { ParsedCargo } from '@/lib/types';

const NOW = new Date('2026-05-10T00:00:00.000Z');

const ALL_EMAIL_IDS = new Set<string>([
  ...cargoInquiries.map((e: { id: string }) => e.id),
  ...vesselPositions.map((e: { id: string }) => e.id),
  ...fixtureRecaps.map((e: { id: string }) => e.id),
  ...clientReplies.map((e: { id: string }) => e.id),
  ...documents.map((e: { id: string }) => e.id),
  ...vesselCerts.map((e: { id: string }) => e.id),
]);

const CARGO_EMAIL_IDS = new Set(cargoInquiries.map((e: { id: string }) => e.id));
const VESSEL_EMAIL_IDS = new Set(vesselPositions.map((e: { id: string }) => e.id));

describe('resolveDemoParsedCargoes', () => {
  it('returns a non-empty array', () => {
    expect(resolveDemoParsedCargoes(NOW).length).toBeGreaterThan(0);
  });

  it('includes the synthetic demo-cargo-economics record (appended by resolver)', () => {
    const result = resolveDemoParsedCargoes(NOW);
    const econ = result.find((c) => c.emailId === 'demo-cargo-economics');
    expect(econ).toBeDefined();
    // Synthetic record carries relative offsets resolved against NOW.
    expect(econ!.laycan).toMatch(/^\d{4}-\d{2}-\d{2} \.\. \d{4}-\d{2}-\d{2}$/);
    const [startStr] = econ!.laycan!.split(' .. ');
    expect(new Date(startStr).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('every corpus-derived emailId exists in a sample-data email file', () => {
    const result = resolveDemoParsedCargoes(NOW);
    const corpus = result.filter((c) => c.emailId !== 'demo-cargo-economics');
    for (const cargo of corpus) {
      expect(CARGO_EMAIL_IDS.has(cargo.emailId)).toBe(true);
    }
  });

  it('synthetic record laycan shifts when seed date shifts', () => {
    const r1 = resolveDemoParsedCargoes(new Date('2026-05-10T00:00:00.000Z'));
    const r2 = resolveDemoParsedCargoes(new Date('2026-06-01T00:00:00.000Z'));
    const econ1 = r1.find((c) => c.emailId === 'demo-cargo-economics')!;
    const econ2 = r2.find((c) => c.emailId === 'demo-cargo-economics')!;
    expect(econ1.laycan).not.toBe(econ2.laycan);
  });

  it('does not mutate fixture data across calls', () => {
    const r1 = resolveDemoParsedCargoes(NOW);
    const r2 = resolveDemoParsedCargoes(NOW);
    expect(r1.map((c) => c.laycan)).toEqual(r2.map((c) => c.laycan));
  });
});

describe('resolveDemoParsedCargoes — schema parity with ParsedCargo', () => {
  let result: ParsedCargo[];
  beforeAll(() => {
    result = resolveDemoParsedCargoes(NOW);
  });

  it('each record has required scalar fields', () => {
    for (const cargo of result) {
      expect(typeof cargo.emailId).toBe('string');
      expect(cargo.emailId.length).toBeGreaterThan(0);
      expect(typeof cargo.itemIndex).toBe('number');
      expect(typeof cargo.cargoType).toBe('string');
    }
  });

  it('missingInfo is always an array', () => {
    for (const cargo of result) {
      expect(Array.isArray(cargo.missingInfo)).toBe(true);
    }
  });

  it('cargoType is a valid CargoType enum value', () => {
    const valid = new Set(['FCL', 'LCL', 'BREAK_BULK', 'BULK', 'PROJECT', 'AIR', 'RORO', 'OTHER']);
    for (const cargo of result) {
      expect(valid.has(cargo.cargoType)).toBe(true);
    }
  });
});

describe('resolveDemoClassifications', () => {
  it('returns one Classification per email in the sample-data fixtures', () => {
    const result = resolveDemoClassifications();
    expect(result.length).toBe(ALL_EMAIL_IDS.size);
  });

  it('every emailId references a real sample-data email', () => {
    const result = resolveDemoClassifications();
    for (const c of result) {
      expect(ALL_EMAIL_IDS.has(c.emailId)).toBe(true);
    }
  });

  it('every emailId is unique', () => {
    const result = resolveDemoClassifications();
    const ids = result.map((c) => c.emailId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every category is a valid EmailCategory enum value', () => {
    const valid = new Set(['CARGO_INQUIRY', 'VESSEL_POSITION', 'FIXTURE_RECAP', 'CLIENT_REPLY', 'DOCUMENT', 'TCT_REQUEST', 'VESSEL_CERTIFICATE', 'OTHER']);
    const result = resolveDemoClassifications();
    for (const c of result) {
      expect(valid.has(c.category)).toBe(true);
    }
  });

  it('does not mutate fixture data between calls', () => {
    const r1 = resolveDemoClassifications();
    const r2 = resolveDemoClassifications();
    expect(r1).toEqual(r2);
  });
});

describe('resolveDemoParsedVessels', () => {
  it('returns a non-empty array including the synthetic vessel', () => {
    const result = resolveDemoParsedVessels(NOW);
    expect(result.length).toBeGreaterThan(0);
    const econ = result.find((v) => v.emailId === 'demo-vessel-economics');
    expect(econ).toBeDefined();
    expect(econ!.openDate).toEqual({ value: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), confidence: 'confirmed' });
  });

  it('every corpus-derived emailId exists in vessel-positions.json', () => {
    const result = resolveDemoParsedVessels(NOW);
    const corpus = result.filter((v) => v.emailId !== 'demo-vessel-economics');
    for (const v of corpus) {
      expect(VESSEL_EMAIL_IDS.has(v.emailId)).toBe(true);
    }
  });

  it('synthetic vessel openDate shifts when seed date shifts', () => {
    const r1 = resolveDemoParsedVessels(new Date('2026-05-10T00:00:00.000Z'));
    const r2 = resolveDemoParsedVessels(new Date('2026-06-01T00:00:00.000Z'));
    const e1 = r1.find((v) => v.emailId === 'demo-vessel-economics')!;
    const e2 = r2.find((v) => v.emailId === 'demo-vessel-economics')!;
    expect(e1.openDate?.value).not.toBe(e2.openDate?.value);
  });
});

describe('resolveDemoProcessedEmails', () => {
  // Build a minimal Email[] matching every classification emailId so
  // buildProcessedEmails has data for each record.
  const classifications = resolveDemoClassifications();
  const emails = classifications.map((c) => ({
    id: c.emailId,
    threadId: `thread-${c.emailId}`,
    from: 'sender@example.com',
    fromName: 'Sender',
    fromEmail: 'sender@example.com',
    to: 'broker@example.com',
    subject: `Subject for ${c.emailId}`,
    date: new Date(NOW.getTime() - 2 * 86_400_000).toISOString(),
    body: '',
    snippet: '',
    labelIds: ['INBOX'],
  }));

  it('returns one ProcessedEmail per classification', () => {
    const result = resolveDemoProcessedEmails(NOW, emails);
    expect(result.length).toBe(classifications.length);
  });

  it('every ProcessedEmail emailId matches a classification emailId', () => {
    const result = resolveDemoProcessedEmails(NOW, emails);
    const ids = new Set(classifications.map((c) => c.emailId));
    for (const pe of result) {
      expect(ids.has(pe.emailId)).toBe(true);
    }
  });
});
