import { scoreClassification } from '../run-classify';

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
