import { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';

const make = (item: Record<string, unknown>) =>
  parseCargoAIResponse(JSON.stringify({ items: [item] }), 'email-1');

describe('parseCargoAIResponse — payout_condition → payoutCondition', () => {
  it('maps payout_condition string', () => {
    const [c] = make({ payout_condition: 'Payment 100% on completion of discharge, LC at sight' });
    expect(c.payoutCondition).toBe('Payment 100% on completion of discharge, LC at sight');
  });
  it('defaults to null when absent', () => {
    const [c] = make({});
    expect(c.payoutCondition).toBeNull();
  });
});
