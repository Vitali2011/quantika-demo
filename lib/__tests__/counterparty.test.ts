import { groupByCounterparty } from '../counterparty';
import type { Email, Classification } from '../types';

function makeEmail(id: string, from: string, threadId = 'thread-1'): Email {
  return {
    id,
    threadId,
    from,
    fromName: null,
    fromEmail: null,
    to: 'me@test.com',
    subject: 'Test',
    date: new Date().toISOString(),
    body: '',
    snippet: '',
    labelIds: ['INBOX'],
  };
}

function makeClassification(emailId: string, category: Classification['category']): Classification {
  return {
    emailId,
    category,
    isUnanswered: false,
    urgency: 'low',
    daysWithoutReply: null,
    confidence: 0.9,
    originalSender: null,
    originalSenderCompany: null,
  };
}

describe('groupByCounterparty', () => {
  it('groups emails by domain', () => {
    const emails = [
      makeEmail('e1', 'Alice <alice@acme.com>'),
      makeEmail('e2', 'bob@acme.com'),
      makeEmail('e3', 'carol@other.com'),
    ];
    const result = groupByCounterparty(emails, []);
    expect(result).toHaveLength(2);
    const acme = result.find(c => c.emailDomain === 'acme.com');
    expect(acme?.emailCount).toBe(2);
    expect(acme?.emails).toContain('e1');
    expect(acme?.emails).toContain('e2');
  });

  it('sorts counterparties by email count descending', () => {
    const emails = [
      makeEmail('e1', 'a@big.com'),
      makeEmail('e2', 'b@big.com'),
      makeEmail('e3', 'c@big.com'),
      makeEmail('e4', 'x@small.com'),
    ];
    const result = groupByCounterparty(emails, []);
    expect(result[0].emailDomain).toBe('big.com');
    expect(result[0].emailCount).toBe(3);
  });

  it('includes email type counts from classifications', () => {
    const emails = [makeEmail('e1', 'a@co.com'), makeEmail('e2', 'b@co.com')];
    const cls = [
      makeClassification('e1', 'CARGO_INQUIRY'),
      makeClassification('e2', 'VESSEL_POSITION'),
    ];
    const result = groupByCounterparty(emails, cls);
    const co = result.find(c => c.emailDomain === 'co.com');
    expect(co?.emailTypes).toHaveLength(2);
    const cargoType = co?.emailTypes.find(t => t.type === 'CARGO_INQUIRY');
    expect(cargoType?.count).toBe(1);
  });

  it('extracts company name from "Name <email>" format', () => {
    const emails = [makeEmail('e1', '"Acme Corp" <contact@acme.com>')];
    const result = groupByCounterparty(emails, []);
    expect(result[0].name).toBe('Acme Corp');
  });

  it('falls back to domain-based name for plain email address', () => {
    const emails = [makeEmail('e1', 'contact@shipping.com')];
    const result = groupByCounterparty(emails, []);
    expect(result[0].name).toBe('Shipping');
  });

  it('returns empty array for empty emails input', () => {
    expect(groupByCounterparty([], [])).toHaveLength(0);
  });
});
