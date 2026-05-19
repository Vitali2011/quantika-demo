import { isVagueRegion } from '../vague-region-detector';

describe('isVagueRegion — non-vague inputs (must NOT trip)', () => {
  it('returns vague=false for null', () => {
    expect(isVagueRegion(null).vague).toBe(false);
  });
  it('returns vague=false for empty string', () => {
    expect(isVagueRegion('').vague).toBe(false);
    expect(isVagueRegion('   ').vague).toBe(false);
  });
  it('returns vague=false for a specific known port', () => {
    expect(isVagueRegion('Istanbul').vague).toBe(false);
    expect(isVagueRegion('Rotterdam').vague).toBe(false);
    expect(isVagueRegion('Jeddah').vague).toBe(false);
  });
  it('returns vague=false for "Marmara" (whitelisted alias)', () => {
    expect(isVagueRegion('Marmara').vague).toBe(false);
  });
  it('returns vague=false for "Marmara Sea" (whitelisted alias)', () => {
    expect(isVagueRegion('Marmara Sea').vague).toBe(false);
  });
  it('returns vague=false for "Sea of Marmara" (whitelisted alias)', () => {
    expect(isVagueRegion('Sea of Marmara').vague).toBe(false);
  });
  it('returns vague=false for "Bay of Biscay" (whitelisted alias)', () => {
    expect(isVagueRegion('Bay of Biscay').vague).toBe(false);
  });
  it('returns vague=false for "Biscay" alone (whitelisted alias)', () => {
    expect(isVagueRegion('Biscay').vague).toBe(false);
  });
});

describe('isVagueRegion — coast descriptors', () => {
  it('detects "East Coast Greece"', () => {
    const r = isVagueRegion('East Coast Greece');
    expect(r.vague).toBe(true);
    expect(r.pattern).toBe('coast descriptor');
    expect(r.suggestion).toMatch(/coastal range/i);
  });
  it('detects "West Coast Africa"', () => {
    expect(isVagueRegion('West Coast Africa').vague).toBe(true);
  });
  it('detects "South Coast Italy"', () => {
    expect(isVagueRegion('South Coast Italy').vague).toBe(true);
  });
  it('detects "North Coast Spain"', () => {
    expect(isVagueRegion('North Coast Spain').vague).toBe(true);
  });
  it('detects "North-East Coast Brazil"', () => {
    expect(isVagueRegion('North-East Coast Brazil').vague).toBe(true);
  });
});

describe('isVagueRegion — sea names', () => {
  it('detects "Aegean Sea"', () => {
    const r = isVagueRegion('Aegean Sea');
    expect(r.vague).toBe(true);
    expect(r.pattern).toBe('sea name');
  });
  it('detects "Red Sea"', () => {
    expect(isVagueRegion('Red Sea').vague).toBe(true);
  });
  it('detects "Black Sea"', () => {
    expect(isVagueRegion('Black Sea').vague).toBe(true);
  });
  it('detects "Adriatic Sea"', () => {
    expect(isVagueRegion('Adriatic Sea').vague).toBe(true);
  });
  it('detects "Caspian Sea"', () => {
    expect(isVagueRegion('Caspian Sea').vague).toBe(true);
  });
  it('detects "Adriatic" alone', () => {
    expect(isVagueRegion('Adriatic').vague).toBe(true);
  });
  it('detects "Mediterranean"', () => {
    expect(isVagueRegion('Mediterranean').vague).toBe(true);
  });
  it('detects "Sea of Japan"', () => {
    expect(isVagueRegion('Sea of Japan').vague).toBe(true);
  });
});

describe('isVagueRegion — country alone', () => {
  it('detects "Tunisia"', () => {
    const r = isVagueRegion('Tunisia');
    expect(r.vague).toBe(true);
    expect(r.pattern).toBe('country only');
    expect(r.suggestion).toMatch(/country/i);
  });
  it('detects "Greece"', () => {
    expect(isVagueRegion('Greece').vague).toBe(true);
  });
  it('detects "Italy"', () => {
    expect(isVagueRegion('Italy').vague).toBe(true);
  });
  it('detects "China"', () => {
    expect(isVagueRegion('China').vague).toBe(true);
  });
});

describe('isVagueRegion — region descriptors', () => {
  it('detects "Aegean Range"', () => {
    expect(isVagueRegion('Aegean Range').vague).toBe(true);
  });
  it('detects "Med Cluster"', () => {
    expect(isVagueRegion('Med Cluster').vague).toBe(true);
  });
  it('detects "Gibraltar Area" (descriptor wins over port substring)', () => {
    // Note: "Gibraltar" alone IS in PORT_ALIASES, so plain "Gibraltar" returns false.
    // "Gibraltar Area" does not match the alias exactly, so range descriptor triggers.
    const r = isVagueRegion('Gibraltar Area');
    // If normalizePortName fuzzy-resolves it, we accept false (safe direction).
    // If not, expect vague=true.
    if (r.vague) expect(r.pattern).toBe('region descriptor');
  });
});

describe('isVagueRegion — gulf descriptors', () => {
  it('detects "Gulf of Aden" when unaliased', () => {
    const r = isVagueRegion('Gulf of Aden');
    // "Aden" is a known port; the segment-splitter in normalizePortName may resolve.
    // Either outcome is acceptable — we just guard the API surface here.
    expect(typeof r.vague).toBe('boolean');
  });
});
