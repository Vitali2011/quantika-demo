import { parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';

// audit D revive: regex fallback (lastcargoes-fallback.ts) feeds hold-cleanliness
// gate + pedigree scoring when the LLM misses last_cargoes.

const BODY_WITH_LC = 'M/V TEST open Aliaga 15-20 Jun\nL/C: coal, grain, urea\ndwt: 12000';
const BODY_WITHOUT_LC = 'M/V TEST open Aliaga 15-20 Jun, dwt 12000 mt, grain clean.';

describe('parseVesselAIResponse — lastCargoes regex fallback via emailBody', () => {
  it('fills lastCargoes from emailBody when LLM omits last_cargoes', () => {
    const llmJson = JSON.stringify({ vessel_name: 'MV TEST', open_date: '2026-06-01' });
    const [result] = parseVesselAIResponse(llmJson, 'email-001', null, BODY_WITH_LC);
    expect(result.lastCargoes).toBe('coal, grain, urea');
  });

  it('LLM-provided last_cargoes wins over emailBody regex (no overwrite)', () => {
    const llmJson = JSON.stringify({ vessel_name: 'MV TEST', last_cargoes: 'steel', open_date: '2026-06-01' });
    const [result] = parseVesselAIResponse(llmJson, 'email-001', null, BODY_WITH_LC);
    expect(result.lastCargoes).toBe('steel');
  });

  it('returns null when no body is provided', () => {
    const llmJson = JSON.stringify({ vessel_name: 'MV TEST', open_date: '2026-06-01' });
    const [result] = parseVesselAIResponse(llmJson, 'email-001', null);
    expect(result.lastCargoes).toBeNull();
  });

  it('returns null when body has no L/C patterns', () => {
    const llmJson = JSON.stringify({ vessel_name: 'MV TEST', open_date: '2026-06-01' });
    const [result] = parseVesselAIResponse(llmJson, 'email-001', null, BODY_WITHOUT_LC);
    expect(result.lastCargoes).toBeNull();
  });

  it('multi-item email: each item gets the fallback independently', () => {
    const llmJson = JSON.stringify({
      items: [
        { vessel_name: 'MV ALPHA', open_date: '2026-06-01' },
        { vessel_name: 'MV BETA', last_cargoes: 'steel', open_date: '2026-06-05' },
      ],
    });
    const results = parseVesselAIResponse(llmJson, 'email-001', null, BODY_WITH_LC);
    expect(results).toHaveLength(2);
    expect(results[0].lastCargoes).toBe('coal, grain, urea');
    expect(results[1].lastCargoes).toBe('steel');
  });
});
