import { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';

const make = (item: Record<string, unknown>) =>
  parseCargoAIResponse(JSON.stringify({ items: [item] }), 'email-1');

describe('parseCargoAIResponse — charterer_name → chartererName (audit A.1)', () => {
  it('maps charterer_name → chartererName', () => {
    const [c] = make({ charterer_name: 'Huaya Maritime' });
    expect(c.chartererName).toBe('Huaya Maritime');
  });
  it('trims surrounding whitespace', () => {
    const [c] = make({ charterer_name: '  Huaya Maritime  ' });
    expect(c.chartererName).toBe('Huaya Maritime');
  });
  it('chartererName is null when charterer_name absent', () => {
    const [c] = make({});
    expect(c.chartererName).toBeNull();
  });
  it('chartererName is null when charterer_name is whitespace-only', () => {
    const [c] = make({ charterer_name: '   ' });
    expect(c.chartererName).toBeNull();
  });
});
