// Boundary tests for email confidence tier logic (#475)
// <0.5 → Low, 0.5–0.8 → Medium, >0.8 → High

function getEmailConfidenceTier(score: number): 'high' | 'medium' | 'low' {
  if (score > 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

describe('getEmailConfidenceTier', () => {
  it('returns "high" for score 0.85', () => {
    expect(getEmailConfidenceTier(0.85)).toBe('high');
  });

  it('returns "medium" for score 0.6', () => {
    expect(getEmailConfidenceTier(0.6)).toBe('medium');
  });

  it('returns "low" for score 0.3', () => {
    expect(getEmailConfidenceTier(0.3)).toBe('low');
  });

  it('returns "medium" at lower boundary 0.5', () => {
    expect(getEmailConfidenceTier(0.5)).toBe('medium');
  });

  it('returns "medium" at upper boundary 0.8', () => {
    expect(getEmailConfidenceTier(0.8)).toBe('medium');
  });

  it('returns "high" for perfect score 1.0', () => {
    expect(getEmailConfidenceTier(1.0)).toBe('high');
  });

  it('returns "low" just below 0.5', () => {
    expect(getEmailConfidenceTier(0.499)).toBe('low');
  });
});
