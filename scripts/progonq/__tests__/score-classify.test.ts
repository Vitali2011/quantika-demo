import { scoreClassification, scoreNormalized } from '../run-classify';

const REF = {
  id: 'e1',
  category: 'CARGO_INQUIRY',
  urgency: 'high',
  confidence: 0.9,
  is_unanswered: true,
  days_without_reply: 3,
  original_sender: 'John Doe',
  original_sender_company: 'Acme Shipping Ltd.',
};

describe('scoreClassification', () => {
  it('all fields exact → all true', () => {
    const r = scoreClassification(REF, { ...REF });
    expect(r.category_match).toBe(true);
    expect(r.urgency_match).toBe(true);
    expect(r.is_unanswered_match).toBe(true);
  });

  it('category mismatch → false', () => {
    const r = scoreClassification(REF, { ...REF, category: 'OTHER' });
    expect(r.category_match).toBe(false);
  });

  it('urgency mismatch → false; case insensitive equal → true', () => {
    expect(scoreClassification(REF, { ...REF, urgency: 'low' }).urgency_match).toBe(false);
    expect(scoreClassification(REF, { ...REF, urgency: 'HIGH' }).urgency_match).toBe(true);
  });

  it('is_unanswered mismatch → false', () => {
    const r = scoreClassification(REF, { ...REF, is_unanswered: false });
    expect(r.is_unanswered_match).toBe(false);
  });

  it('preserves raw original_sender_company for judge', () => {
    const r = scoreClassification(REF, { ...REF, original_sender_company: 'Acme Shipping' });
    expect(r.ref_company).toBe('Acme Shipping Ltd.');
    expect(r.model_company).toBe('Acme Shipping');
  });

  it('null model → category mismatch (parsing failed)', () => {
    const r = scoreClassification(REF, null);
    expect(r.category_match).toBe(false);
    expect(r.urgency_match).toBe(false);
  });
});

// REF_LOW simulates a stale GT entry: CARGO_INQUIRY with urgency=low (GT rule drift)
const REF_LOW = {
  ...REF,
  urgency: 'low',
  days_without_reply: 36,
  original_sender_company: 'Acme Shipping Ltd.',
};
// EMAIL_DATE is an old email — GT was captured when it was 36 days old,
// but today (relative to 2026-05-17) it would be ~42 days old.
const EMAIL_DATE_ISO = '2026-04-05T14:00:00Z';

describe('scoreNormalized', () => {
  // Freeze time so recomputeDays('2026-04-05T14:00:00Z') === 36 (exactly 36d gap).
  // Without this, Date.now() drifts and daysMatch(ref=recomputed, model=41) fails once
  // drift exceeds the ±10d tolerance (EMAIL_DATE_ISO is fixed, real time is not).
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-11T14:00:00Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('normalizes CARGO_INQUIRY low→medium, so medium model urgency matches', () => {
    const model = { ...REF_LOW, urgency: 'medium', days_without_reply: 41 };
    const r = scoreNormalized(REF_LOW, model, EMAIL_DATE_ISO);
    expect(r.urgency_match).toBe(true);
  });

  it('still fails if model urgency is wrong after normalization', () => {
    const model = { ...REF_LOW, urgency: 'low', days_without_reply: 41 };
    const r = scoreNormalized(REF_LOW, model, EMAIL_DATE_ISO);
    expect(r.urgency_match).toBe(false);
  });

  it('days_match passes when within ±10d tolerance', () => {
    const model = { ...REF_LOW, urgency: 'medium', days_without_reply: 41 };
    const r = scoreNormalized(REF_LOW, model, EMAIL_DATE_ISO);
    expect(r.days_match).toBe(true);
  });

  it('company_name_match normalizes punctuation and case', () => {
    const model = { ...REF_LOW, urgency: 'medium', days_without_reply: 41, original_sender_company: 'acme shipping ltd' };
    const r = scoreNormalized(REF_LOW, model, EMAIL_DATE_ISO);
    expect(r.company_name_match).toBe(true);
  });

  it('null model → all false', () => {
    const r = scoreNormalized(REF_LOW, null, EMAIL_DATE_ISO);
    expect(r.category_match).toBe(false);
    expect(r.urgency_match).toBe(false);
    expect(r.is_unanswered_match).toBe(false);
  });

  it('null model + null ref company → company_name_match false (H2 regression)', () => {
    const refNoCompany = { ...REF_LOW, original_sender_company: null as unknown as string };
    const r = scoreNormalized(refNoCompany, null, EMAIL_DATE_ISO);
    expect(r.company_name_match).toBe(false);
  });

  it('null model + invalid email date → days_match false (H2 regression)', () => {
    const r = scoreNormalized(REF_LOW, null, 'not-a-date');
    expect(r.days_match).toBe(false);
  });
});
