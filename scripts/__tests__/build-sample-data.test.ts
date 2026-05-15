import { computeDateOffsets, splitByCategory } from '../build-sample-data';
import type { Email, Classification, EmailCategory } from '../../lib/types';

function mkEmail(id: string, date: string): Email {
  return {
    id,
    threadId: id,
    from: 'x',
    fromName: null,
    fromEmail: null,
    to: 'y',
    subject: 's',
    date,
    body: 'b',
    snippet: 'sn',
    labelIds: [],
  };
}

function mkCls(emailId: string, category: EmailCategory): Classification {
  return {
    emailId,
    category,
    isUnanswered: false,
    urgency: 'medium',
    daysWithoutReply: null,
    confidence: 1.0,
    originalSender: null,
    originalSenderCompany: null,
  };
}

describe('computeDateOffsets', () => {
  it('newest email gets offset 0; older ones get negative day counts', () => {
    const emails = [
      mkEmail('a', '2026-04-01T00:00:00.000Z'),
      mkEmail('b', '2026-04-05T00:00:00.000Z'), // newest
      mkEmail('c', '2026-04-03T00:00:00.000Z'),
    ];
    const result = computeDateOffsets(emails);
    expect(result.get('b')).toBe(0);
    expect(result.get('c')).toBe(-2);
    expect(result.get('a')).toBe(-4);
  });

  it('two emails on the same calendar day get the same offset', () => {
    const emails = [
      mkEmail('a', '2026-04-05T10:00:00.000Z'),
      mkEmail('b', '2026-04-05T23:00:00.000Z'),
    ];
    const result = computeDateOffsets(emails);
    expect(result.get('a')).toBe(0);
    expect(result.get('b')).toBe(0);
  });
});

describe('splitByCategory', () => {
  it('routes email IDs into the six fixture buckets by category', () => {
    const classifications: Classification[] = [
      mkCls('e1', 'CARGO_INQUIRY'),
      mkCls('e2', 'TCT_REQUEST'),
      mkCls('e3', 'OTHER'),
      mkCls('e4', 'VESSEL_POSITION'),
      mkCls('e5', 'FIXTURE_RECAP'),
      mkCls('e6', 'CLIENT_REPLY'),
      mkCls('e7', 'DOCUMENT'),
      mkCls('e8', 'VESSEL_CERTIFICATE'),
    ];
    const buckets = splitByCategory(classifications);
    expect(buckets.cargoInquiries).toEqual(['e1', 'e2', 'e3']);
    expect(buckets.vesselPositions).toEqual(['e4']);
    expect(buckets.fixtureRecaps).toEqual(['e5']);
    expect(buckets.clientReplies).toEqual(['e6']);
    expect(buckets.documents).toEqual(['e7']);
    expect(buckets.vesselCerts).toEqual(['e8']);
  });

  it('throws on an unknown category instead of silently dropping the email', () => {
    const bogus = { emailId: 'e1', category: 'NONSENSE' } as unknown as Classification;
    expect(() => splitByCategory([bogus])).toThrow(/NONSENSE/);
  });
});
