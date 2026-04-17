jest.mock('@/lib/openai', () => ({
  callAiText: jest.fn(),
  callAiJson: jest.fn(),
}));

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
  updateSession: jest.fn(),
}));

import { parseRecapAIResponse } from '@/app/api/ai/parse-recap/route';

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
});
