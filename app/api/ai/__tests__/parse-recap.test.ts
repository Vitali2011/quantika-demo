import { parseRecapAIResponse } from '@/app/api/ai/parse-recap/route';

jest.mock('@/lib/session');
jest.mock('@/lib/openai');
jest.mock('@/lib/commission', () => ({
  summarizeCommissions: jest.fn().mockReturnValue(null),
}));

const happyRaw = JSON.stringify({
  vessel_name: { value: 'MV ATLANTIS', confidence: 'confirmed' },
  owners: { value: 'Alpha Shipping', confidence: 'confirmed' },
  charterers: { value: 'Beta Trading', confidence: 'confirmed' },
  account: null,
  broker: 'BrokerCo',
  load_port: { value: 'Rotterdam', confidence: 'confirmed' },
  disch_port: { value: 'Singapore', confidence: 'interpreted' },
  cargo_description: { value: 'wheat', confidence: 'confirmed' },
  cargo_quantity_min: 20000,
  cargo_quantity_max: 25000,
  laycan: { value: '1-10 Feb 2024', confidence: 'confirmed' },
  freight_rate: { value: '28.50 USD/MT', confidence: 'confirmed' },
  loading_rate: { value: '5000 MT/day', confidence: 'confirmed' },
  loading_terms: { value: 'SHINC', confidence: 'confirmed' },
  discharging_rate: { value: '4000 MT/day', confidence: 'confirmed' },
  discharging_terms: { value: 'SHINC', confidence: 'confirmed' },
  demurrage_rate: { value: 'USD 8000 PDPR', confidence: 'confirmed' },
  commission_percent: 3.75,
  commission_base: 'freight',
  commission_amount: 26718.75,
  commission_currency: 'USD',
  subs: ['STEM', 'SHINC'],
  confidentiality: false,
  additional_terms: [],
  unknown_terms: [],
});

describe('parseRecapAIResponse', () => {
  it('happy path: returns ParsedFixtureRecap with correct emailId', () => {
    const result = parseRecapAIResponse(happyRaw, 'recap-email-1');
    expect(result.emailId).toBe('recap-email-1');
    expect(result.broker).toBe('BrokerCo');
    expect(result.cargoQuantityMin).toBe(20000);
    expect(result.cargoQuantityMax).toBe(25000);
  });

  it('happy path: parses commissionPercent and commissionAmount', () => {
    const result = parseRecapAIResponse(happyRaw, 'recap-email-1');
    expect(result.commissionPercent).toBe(3.75);
    expect(result.commissionAmount).toBe(26718.75);
    expect(result.commissionCurrency).toBe('USD');
    expect(result.commissionBase).toBe('freight');
  });

  it('falls back to commission_pct when commission_percent is absent', () => {
    const raw = JSON.stringify({ commission_pct: 2.5 });
    const result = parseRecapAIResponse(raw, 'e1');
    expect(result.commissionPercent).toBe(2.5);
  });

  it('returns null commissionPercent when both commission_percent and commission_pct are absent', () => {
    const raw = JSON.stringify({ vessel_name: 'MV X', freight_rate: null });
    const result = parseRecapAIResponse(raw, 'e1');
    expect(result.commissionPercent).toBeNull();
  });

  it('sets confidentiality to false by default when field is null', () => {
    const raw = JSON.stringify({ confidentiality: null });
    const result = parseRecapAIResponse(raw, 'e1');
    expect(result.confidentiality).toBe(false);
  });

  it('returns empty arrays for subs, additionalTerms, unknownTerms when absent', () => {
    const raw = JSON.stringify({});
    const result = parseRecapAIResponse(raw, 'e1');
    expect(result.subs).toEqual([]);
    expect(result.additionalTerms).toEqual([]);
    expect(result.unknownTerms).toEqual([]);
  });

  it('parses subs array correctly when present', () => {
    const result = parseRecapAIResponse(happyRaw, 'recap-email-1');
    expect(result.subs).toEqual(['STEM', 'SHINC']);
  });

  it('throws on malformed JSON input', () => {
    expect(() => parseRecapAIResponse('{bad json', 'e1')).toThrow();
  });
});
