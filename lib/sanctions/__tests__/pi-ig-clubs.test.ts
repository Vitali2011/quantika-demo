import { PI_IG_CLUBS, isIgClub } from '../pi-ig-clubs';

describe('PI_IG_CLUBS', () => {
  it('contains exactly 13 clubs', () => {
    expect(PI_IG_CLUBS).toHaveLength(13);
  });

  it('includes all major IG clubs', () => {
    const expected = ['Gard', 'UK', 'North', 'Skuld', 'Britannia', 'Steamship Mutual',
      'West', 'American', 'Japan', 'London', 'Shipowners', 'Standard', 'Swedish'];
    for (const club of expected) {
      expect(PI_IG_CLUBS).toContain(club);
    }
  });
});

describe('isIgClub', () => {
  it('matches exact club names (case-insensitive)', () => {
    expect(isIgClub('Gard')).toBe(true);
    expect(isIgClub('gard')).toBe(true);
    expect(isIgClub('SKULD')).toBe(true);
    expect(isIgClub('britannia')).toBe(true);
  });

  it('matches club names with common suffixes', () => {
    expect(isIgClub('Gard P&I')).toBe(true);
    expect(isIgClub('UK P&I Club')).toBe(true);
    expect(isIgClub('North of England P&I')).toBe(true);
    expect(isIgClub('Steamship Mutual P&I')).toBe(true);
    expect(isIgClub('American Club')).toBe(true);
  });

  it('returns false for non-IG clubs', () => {
    expect(isIgClub('Unknown Insurer')).toBe(false);
    expect(isIgClub('')).toBe(false);
    expect(isIgClub('Some Maritime Club')).toBe(false);
  });
});
