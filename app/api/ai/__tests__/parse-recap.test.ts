jest.mock('@/lib/openai', () => ({
  callAiText: jest.fn(),
  callAiJson: jest.fn(),
}));

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
  updateSession: jest.fn(),
}));

import { parseRecapAIResponse } from '@/lib/parsing/parse-recap-helpers';

// ── parseRecapAIResponse ──────────────────────────────────────────────────────

describe('parseRecapAIResponse', () => {
  it('parses a full recap with commission fields', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'MV TEST', confidence: 'confirmed' },
      owners: { value: 'Owner Co', confidence: 'confirmed' },
      charterers: { value: 'Charter Co', confidence: 'confirmed' },
      load_port: { value: 'Rotterdam', confidence: 'confirmed' },
      disch_port: { value: 'Singapore', confidence: 'confirmed' },
      freight_rate: { value: '35 USD/MT', confidence: 'confirmed' },
      commission_percent: 2.5,
      commission_base: 'freight',
      commission_currency: 'USD',
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-1');
    expect(result.emailId).toBe('email-1');
    expect(result.vesselName?.value).toBe('MV TEST');
    expect(result.commissionPercent).toBe(2.5);
    expect(result.commissionBase).toBe('freight');
    expect(result.commissionCurrency).toBe('USD');
  });

  it('returns null commissionPercent when commission fields are absent', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'MV NOCOMM', confidence: 'confirmed' },
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-2');
    expect(result.commissionPercent).toBeNull();
    expect(result.commissionAmount).toBeNull();
  });

  it('falls back to commission_pct when commission_percent is absent', () => {
    const raw = JSON.stringify({
      commission_pct: 3.75,
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-3');
    expect(result.commissionPercent).toBe(3.75);
  });

  it('returns a minimal record with null fields on malformed JSON', () => {
    const result = parseRecapAIResponse('not-valid-json{{', 'email-4');
    expect(result.emailId).toBe('email-4');
    expect(result.vesselName).toBeNull();
    expect(result.commissionPercent).toBeNull();
    expect(result.subs).toEqual([]);
  });

  it('strips markdown fences before parsing', () => {
    const inner = JSON.stringify({
      vessel_name: { value: 'FENCED', confidence: 'confirmed' },
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const raw = '```json\n' + inner + '\n```';
    const result = parseRecapAIResponse(raw, 'email-5');
    expect(result.vesselName?.value).toBe('FENCED');
  });

  it('returns defaults when fields are missing (empty string → null)', () => {
    const raw = JSON.stringify({
      subs: ['SUBJ TO OWNER'],
      additional_terms: ['ITFWTSA'],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-6');
    expect(result.subs).toEqual(['SUBJ TO OWNER']);
    expect(result.additionalTerms).toEqual(['ITFWTSA']);
    expect(result.broker).toBeNull();
    expect(result.vesselName).toBeNull();
  });

  it('handles vesselGeared boolean correctly', () => {
    const raw = JSON.stringify({
      vessel_geared: true,
      vessel_dwt: '75000',
      vessel_draft: 14.5,
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-7');
    expect(result.vesselGeared).toBe(true);
    expect(result.vesselDwt).toBe(75000);
    expect(result.vesselDraft).toBe(14.5);
  });

  it('parses full NORTHSTAR GLORY AI response → EUR 139,500 freight fixture', () => {
    // sample-15: EUR 31.00/mt × 4,500 mts = EUR 139,500 total freight
    const raw = JSON.stringify({
      vessel_name: { value: 'MV NORTHSTAR GLORY', confidence: 'confirmed' },
      owners: { value: 'Northstar Maritime Ltd', confidence: 'confirmed' },
      charterers: { value: 'Varan Shipping', confidence: 'confirmed' },
      account: { value: 'Arabian Bulk Trading', confidence: 'confirmed' },
      load_port: { value: 'Figueira da Foz (FDF), Portugal', confidence: 'confirmed' },
      disch_port: { value: 'Alexandria (ALEX), Egypt', confidence: 'confirmed' },
      cargo_description: { value: 'sawn timber in bundles', confidence: 'confirmed' },
      cargo_quantity_min: 4000,
      cargo_quantity_max: 4500,
      freight_rate: { value: 'EUR 31.00/mt FIOST', confidence: 'confirmed' },
      commission_percent: 3.75,
      commission_base: 'freight',
      commission_currency: 'EUR',
      demurrage_rate: { value: 'EUR 5,500 PDPR', confidence: 'confirmed' },
      cp_form: 'GENCON 94',
      arbitration: 'London',
      law: 'English',
      subs: ['stem + owners approval within 2 banking days'],
      additional_terms: [],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'sample-15');
    expect(result.vesselName?.value).toBe('MV NORTHSTAR GLORY');
    expect(result.loadPort?.value).toContain('Figueira da Foz');
    expect(result.dischPort?.value).toContain('Alexandria');
    expect(result.freightRate?.value).toContain('EUR 31.00');
    expect(result.cargoQuantityMax).toBe(4500);
    expect(result.cargoQuantityMin).toBe(4000);
    expect(result.commissionPercent).toBe(3.75);
  });
});
