import { extractBuiltYearFromText, parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';

describe('extractBuiltYearFromText — regex fallback for built year', () => {
  it('"blt 1997" → 1997', () => {
    expect(extractBuiltYearFromText('blt 1997')).toBe(1997);
  });

  it('"built 2008-08 china" → 2008', () => {
    expect(extractBuiltYearFromText('built 2008-08 china')).toBe(2008);
  });

  it('"blt 2008  china" → 2008 (extra spaces)', () => {
    expect(extractBuiltYearFromText('blt 2008  china')).toBe(2008);
  });

  it('"BLT 1996" → 1996 (uppercase)', () => {
    expect(extractBuiltYearFromText('BLT 1996')).toBe(1996);
  });

  it('"1989 BLT" → 1989 (year before label)', () => {
    expect(extractBuiltYearFromText('1989 BLT')).toBe(1989);
  });

  it('"YOB 2005" → 2005', () => {
    expect(extractBuiltYearFromText('YOB 2005')).toBe(2005);
  });

  it('absent → null (do not invent)', () => {
    expect(extractBuiltYearFromText('dwt 12000 mt at 5.5m draft')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractBuiltYearFromText('')).toBeNull();
  });

  it('does not pick up laycan year "LAYCAN: 23-26 FEB 2021" → null', () => {
    expect(extractBuiltYearFromText('LAYCAN: 23-26 FEB 2021')).toBeNull();
  });

  it('does not extract year from subject date "Ocean7 Projects — 21 May 2025" → null', () => {
    expect(extractBuiltYearFromText('Ocean7 Projects — 21 May 2025')).toBeNull();
  });
});

describe('parseVesselAIResponse — built year regex fallback via emailBody', () => {
  it('fills built from emailBody when LLM returns null and email contains "blt YYYY"', () => {
    const llmJson = JSON.stringify({ vessel_name: 'MV TEST', built: null, open_date: '2026-06-01' });
    const [result] = parseVesselAIResponse(llmJson, 'email-001', null, 'SID BOX blt 1997 DWT 3200');
    expect(result.built).toBe(1997);
  });

  it('LLM-provided built value wins over emailBody regex', () => {
    const llmJson = JSON.stringify({ vessel_name: 'MV TEST', built: 2003, open_date: '2026-06-01' });
    const [result] = parseVesselAIResponse(llmJson, 'email-001', null, 'SID BOX blt 1997 DWT 3200');
    expect(result.built).toBe(2003);
  });

  it('returns null built when neither LLM nor email has built info', () => {
    const llmJson = JSON.stringify({ vessel_name: 'MV TEST', built: null, open_date: '2026-06-01' });
    const [result] = parseVesselAIResponse(llmJson, 'email-001', null, 'dwt 12000 mt open Rotterdam');
    expect(result.built).toBeNull();
  });
});
