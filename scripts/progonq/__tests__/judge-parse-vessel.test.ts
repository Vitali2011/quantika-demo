import { FLAG_JUDGE } from '../judge-parse-vessel';

describe('FLAG_JUDGE prompt', () => {
  it('is defined and non-empty', () => {
    expect(typeof FLAG_JUDGE).toBe('string');
    expect(FLAG_JUDGE.length).toBeGreaterThan(0);
  });

  it('contains capital-city equivalence rule (Belize City pattern)', () => {
    const lower = FLAG_JUDGE.toLowerCase();
    const hasCapitalRule = lower.includes('capital') || lower.includes('belize city');
    expect(hasCapitalRule).toBe(true);
  });

  it('instructs to reply with JSON equiv field', () => {
    expect(FLAG_JUDGE).toMatch(/"equiv"/);
  });

  it('covers territory = parent state rule', () => {
    const lower = FLAG_JUDGE.toLowerCase();
    const hasTerritoryRule =
      lower.includes('territory') ||
      lower.includes('madeira') ||
      lower.includes('parent');
    expect(hasTerritoryRule).toBe(true);
  });

  it('covers abbreviated / partial name rule', () => {
    const lower = FLAG_JUDGE.toLowerCase();
    const hasAbbrevRule =
      lower.includes('abbreviated') ||
      lower.includes('partial') ||
      lower.includes('st vincent') ||
      lower.includes('saint vincent');
    expect(hasAbbrevRule).toBe(true);
  });
});

// Skipped: requires live LLM API
describe.skip('FLAG_JUDGE integration (requires API)', () => {
  it('ST VINCENT = Saint Vincent and the Grenadines → equiv=true', async () => {
    // Would call judgePair("ST VINCENT", "Saint Vincent and the Grenadines", FLAG_JUDGE)
    // Expected: { equiv: true, reason: <string> }
  });

  it('Madeira = Portugal → equiv=true', async () => {
    // Would call judgePair("Madeira", "Portugal", FLAG_JUDGE)
    // Expected: { equiv: true, reason: <string> }
  });

  it('Belize City = Belize → equiv=true', async () => {
    // Would call judgePair("BELIZE CITY", "Belize", FLAG_JUDGE)
    // Expected: { equiv: true, reason: <string> }
  });

  it('Panama ≠ Bahamas → equiv=false', async () => {
    // Would call judgePair("Panama", "Bahamas", FLAG_JUDGE)
    // Expected: { equiv: false }
  });
});

import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts/parse-vessel';

describe('VESSEL_POSITION_PARSER_PROMPT — TC vessel rule', () => {
  it('contains TC vessel rule', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toContain('ON TC');
  });

  it('restricts TC rule to fleet position context', () => {
    const lower = VESSEL_POSITION_PARSER_PROMPT.toLowerCase();
    // Rule should be context-restricted (fleet list / owner fleet)
    const hasContextGuard = lower.includes('fleet position') || lower.includes("owner's fleet") || lower.includes('fleet positions');
    expect(hasContextGuard).toBe(true);
  });

  it('excludes cargo inquiries from TC rule', () => {
    const lower = VESSEL_POSITION_PARSER_PROMPT.toLowerCase();
    const hasExclusion = lower.includes('cargo inquiry') || lower.includes('do not apply');
    expect(hasExclusion).toBe(true);
  });
});

describe('VESSEL_POSITION_PARSER_PROMPT — flag normalization rules', () => {
  it('contains BELIZE CITY normalization', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toContain('BELIZE CITY');
  });

  it('contains ST VINCENT normalization', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toContain('ST VINCENT');
  });

  it('instructs NOT to expand & to and for other flags', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toMatch(/do not.*expand.*&.*to.*and/i);
  });
});

describe('VESSEL_POSITION_PARSER_PROMPT — formatting markers rule', () => {
  it('contains asterisks formatting rule', () => {
    const lower = VESSEL_POSITION_PARSER_PROMPT.toLowerCase();
    const hasAsteriskRule = lower.includes('asterisk') || lower.includes('formatting marker') || lower.includes('delimiter');
    expect(hasAsteriskRule).toBe(true);
  });
});

describe('VESSEL_POSITION_PARSER_PROMPT — fleet completeness rule', () => {
  it('instructs to check both summary table and spec blocks', () => {
    const lower = VESSEL_POSITION_PARSER_PROMPT.toLowerCase();
    const hasFleetRule = lower.includes('summary table') || lower.includes('spec block');
    expect(hasFleetRule).toBe(true);
  });
});
