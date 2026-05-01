import cargoInquiries from '@/lib/sample-data/cargo-inquiries.json';
import vesselPositions from '@/lib/sample-data/vessel-positions.json';
import fixtureRecaps from '@/lib/sample-data/fixture-recaps.json';
import clientReplies from '@/lib/sample-data/client-replies.json';
import documents from '@/lib/sample-data/documents.json';
import vesselCerts from '@/lib/sample-data/vessel-certs.json';

const SAMPLE_EMAILS = [
  ...cargoInquiries,
  ...vesselPositions,
  ...fixtureRecaps,
  ...clientReplies,
  ...documents,
  ...vesselCerts,
];

describe('SAMPLE_EMAILS (V2 minimal corpus)', () => {
  it('contains exactly 32 emails', () => {
    expect(SAMPLE_EMAILS).toHaveLength(32);
  });

  it('every email has required fields', () => {
    for (const email of SAMPLE_EMAILS) {
      expect(email).toHaveProperty('id');
      expect(email).toHaveProperty('subject');
      expect(email).toHaveProperty('from');
      expect(email).toHaveProperty('body');
      expect(email).toHaveProperty('_meta');
    }
  });

  it('all ids are unique sample-01..sample-32', () => {
    const ids = SAMPLE_EMAILS.map((e) => e.id).sort();
    const want = Array.from({ length: 32 }, (_, i) => `sample-${String(i + 1).padStart(2, '0')}`);
    expect(ids).toEqual(want);
  });

  it('id-format: all ids match sample-NN', () => {
    for (const email of SAMPLE_EMAILS) {
      expect(email.id).toMatch(/^sample-\d{2}$/);
    }
  });
});
