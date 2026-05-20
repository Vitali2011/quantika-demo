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
// eslint-disable-next-line jest/no-disabled-tests
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
