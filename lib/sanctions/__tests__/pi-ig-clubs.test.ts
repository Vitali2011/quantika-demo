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

  it('matches IG club name variants with a leading "The "', () => {
    // Real-world false-negative: "The North of England" is a legit IG club
    // name variant but startsWith('north') never fires because of the prefix.
    expect(isIgClub('The North of England')).toBe(true);
    expect(isIgClub('The North of England P&I')).toBe(true);
    expect(isIgClub('The Standard Club')).toBe(true);
    expect(isIgClub('The West of England')).toBe(true);
    expect(isIgClub('The Swedish Club')).toBe(true);
    expect(isIgClub('The Britannia')).toBe(true);
  });

  it('does NOT match non-IG names that merely share a prefix (no false-positives)', () => {
    // startsWith over-matched these: "standard"→Standard, "north"→North, "west"→West.
    expect(isIgClub('Standard Chartered Bank')).toBe(false);
    expect(isIgClub('Northern Trust')).toBe(false);
    expect(isIgClub('Western Union')).toBe(false);
    expect(isIgClub('London Stock Exchange')).toBe(false);
    expect(isIgClub('American Express')).toBe(false);
  });
});
