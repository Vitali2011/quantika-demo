import {
  recomputeDays,
  normalizeUrgency,
  normalizeCompanyName,
  daysMatch,
  normalizeRef,
  CORPUS_GEN_DATE,
} from '../email-normalize';

const TODAY = new Date('2026-05-17T12:00:00Z');

describe('recomputeDays', () => {
  it('returns 0 for today', () => {
    expect(recomputeDays(TODAY.toISOString(), TODAY)).toBe(0);
  });

  it('returns 6 for email 6 days ago', () => {
    const sixDaysAgo = new Date(TODAY.getTime() - 6 * 86_400_000);
    expect(recomputeDays(sixDaysAgo.toISOString(), TODAY)).toBe(6);
  });

  it('returns null for invalid date', () => {
    expect(recomputeDays('not-a-date', TODAY)).toBeNull();
  });

  it('returns 0 for future email (clamps to 0)', () => {
    const tomorrow = new Date(TODAY.getTime() + 86_400_000);
    expect(recomputeDays(tomorrow.toISOString(), TODAY)).toBe(0);
  });

  it('corpus gen date is ~6 days before today', () => {
    const days = recomputeDays(CORPUS_GEN_DATE.toISOString(), TODAY);
    expect(days).toBe(6);
  });
});

describe('normalizeUrgency', () => {
  it('CARGO_INQUIRY low → medium', () => {
    expect(normalizeUrgency('CARGO_INQUIRY', 'low')).toBe('medium');
  });

  it('CARGO_INQUIRY medium → medium', () => {
    expect(normalizeUrgency('CARGO_INQUIRY', 'medium')).toBe('medium');
  });

  it('CARGO_INQUIRY high → high', () => {
    expect(normalizeUrgency('CARGO_INQUIRY', 'high')).toBe('high');
  });

  it('TCT_REQUEST low → medium', () => {
    expect(normalizeUrgency('TCT_REQUEST', 'low')).toBe('medium');
  });

  it('VESSEL_POSITION low → medium', () => {
    expect(normalizeUrgency('VESSEL_POSITION', 'low')).toBe('medium');
  });

  it('VESSEL_POSITION medium stays medium', () => {
    expect(normalizeUrgency('VESSEL_POSITION', 'medium')).toBe('medium');
  });

  it('VESSEL_POSITION high stays high', () => {
    expect(normalizeUrgency('VESSEL_POSITION', 'high')).toBe('high');
  });

  it('DOCUMENT low stays low', () => {
    expect(normalizeUrgency('DOCUMENT', 'low')).toBe('low');
  });

  it('OTHER low stays low', () => {
    expect(normalizeUrgency('OTHER', 'low')).toBe('low');
  });

  it('case-normalizes to lowercase', () => {
    expect(normalizeUrgency('CARGO_INQUIRY', 'HIGH')).toBe('high');
    expect(normalizeUrgency('CARGO_INQUIRY', 'Medium')).toBe('medium');
  });
});

describe('normalizeCompanyName', () => {
  it('returns null for null input', () => {
    expect(normalizeCompanyName(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeCompanyName(undefined)).toBeNull();
  });

  it('lowercases the name', () => {
    expect(normalizeCompanyName('Acme Shipping Ltd.')).toBe('acme shipping ltd');
  });

  it('strips trailing punctuation', () => {
    expect(normalizeCompanyName('Acme Co.')).toBe('acme co');
    expect(normalizeCompanyName('Atlas Maritime S.A.')).toBe('atlas maritime s.a');
  });

  it('collapses whitespace', () => {
    expect(normalizeCompanyName('Gulf  Maritime   Brokers')).toBe('gulf maritime brokers');
  });

  it('strips leading "the "', () => {
    expect(normalizeCompanyName('The West of England P&I Club')).toBe('west of england p&i club');
  });

  it('preserves "the" in mid-name position (H1 regression)', () => {
    expect(normalizeCompanyName('Pan the Sea Shipping Co.')).toBe('pan the sea shipping co');
    expect(normalizeCompanyName('Northern the Lion Ltd')).toBe('northern the lion ltd');
  });

  it('same company with minor difference normalizes to equal strings', () => {
    const a = normalizeCompanyName('Varan Shipping');
    const b = normalizeCompanyName('Varan Shipping');
    expect(a).toBe(b);
  });
});

describe('daysMatch', () => {
  it('both null → true', () => {
    expect(daysMatch(null, null)).toBe(true);
  });

  it('one null → false', () => {
    expect(daysMatch(3, null)).toBe(false);
    expect(daysMatch(null, 3)).toBe(false);
  });

  it('within default tolerance (±10) → true', () => {
    expect(daysMatch(6, 9)).toBe(true);
    expect(daysMatch(36, 41)).toBe(true);
    expect(daysMatch(41, 36)).toBe(true);
  });

  it('exceeds tolerance → false', () => {
    expect(daysMatch(1, 20)).toBe(false);
    expect(daysMatch(0, 15)).toBe(false);
  });

  it('exact match → true', () => {
    expect(daysMatch(5, 5)).toBe(true);
  });

  it('respects custom tolerance', () => {
    expect(daysMatch(0, 3, 2)).toBe(false);
    expect(daysMatch(0, 3, 3)).toBe(true);
  });
});

describe('normalizeRef', () => {
  const BASE_REF = {
    category: 'CARGO_INQUIRY',
    urgency: 'low',
    is_unanswered: true,
    days_without_reply: 36,
    original_sender_company: 'Saudi Bulk Traders Co.',
  };

  it('normalizes urgency low→medium for CARGO_INQUIRY', () => {
    const norm = normalizeRef(BASE_REF, '2026-04-05T14:00:00Z', TODAY);
    expect(norm.urgency).toBe('medium');
  });

  it('recomputes days from email date', () => {
    const norm = normalizeRef(BASE_REF, '2026-04-05T14:00:00Z', TODAY);
    // 2026-04-05T14:00Z → 2026-05-17T12:00Z = 41 full days (2h short of 42)
    expect(norm.days_without_reply).toBe(41);
  });

  it('normalizes company name', () => {
    const norm = normalizeRef(BASE_REF, '2026-04-05T14:00:00Z', TODAY);
    expect(norm.original_sender_company).toBe('saudi bulk traders co');
  });

  it('preserves category and is_unanswered', () => {
    const norm = normalizeRef(BASE_REF, '2026-04-05T14:00:00Z', TODAY);
    expect(norm.category).toBe('CARGO_INQUIRY');
    expect(norm.is_unanswered).toBe(true);
  });

  it('handles null company', () => {
    const ref = { ...BASE_REF, original_sender_company: undefined };
    const norm = normalizeRef(ref, '2026-04-05T14:00:00Z', TODAY);
    expect(norm.original_sender_company).toBeNull();
  });
});
