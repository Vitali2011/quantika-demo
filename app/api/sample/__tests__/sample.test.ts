import cargoInquiries from '@/lib/sample-data/cargo-inquiries.json';
import vesselPositions from '@/lib/sample-data/vessel-positions.json';
import fixtureRecaps from '@/lib/sample-data/fixture-recaps.json';
import clientReplies from '@/lib/sample-data/client-replies.json';

const SAMPLE_EMAILS = [
  ...cargoInquiries,
  ...vesselPositions,
  ...fixtureRecaps,
  ...clientReplies,
];

describe('SAMPLE_EMAILS', () => {
  it('count: contains at least 50 emails (115 after Wave-corpus expansion)', () => {
    expect(SAMPLE_EMAILS.length).toBeGreaterThanOrEqual(50);
  });

  it('required-fields: every email has id, subject, from, body', () => {
    for (const email of SAMPLE_EMAILS) {
      expect(email).toHaveProperty('id');
      expect(email).toHaveProperty('subject');
      expect(email).toHaveProperty('from');
      expect(email).toHaveProperty('body');
    }
  });

  it('unique-ids: all ids are unique', () => {
    const ids = SAMPLE_EMAILS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id-format: all ids start with "sample-"', () => {
    for (const email of SAMPLE_EMAILS) {
      expect(email.id).toMatch(/^sample-\d+$/);
    }
  });
});
