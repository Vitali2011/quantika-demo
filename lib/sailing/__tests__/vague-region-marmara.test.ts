import { isVagueRegion } from '../vague-region-detector';

describe('isVagueRegion — Marmara sea detection (Task 5)', () => {
  it('"Marmara Sea" → vague:true with pattern:"sea name"', () => {
    const r = isVagueRegion('Marmara Sea');
    expect(r.vague).toBe(true);
    expect(r.pattern).toBe('sea name');
  });

  it('"Sea of Marmara" → vague:true', () => {
    const r = isVagueRegion('Sea of Marmara');
    expect(r.vague).toBe(true);
    expect(r.pattern).toBe('sea name');
  });

  it('"marmara sea" (lowercase) → vague:true', () => {
    expect(isVagueRegion('marmara sea').vague).toBe(true);
  });

  it('"sea of marmara" (lowercase) → vague:true', () => {
    expect(isVagueRegion('sea of marmara').vague).toBe(true);
  });

  it('"Nemrut Bay" (real port) → vague:false', () => {
    expect(isVagueRegion('Nemrut Bay').vague).toBe(false);
  });

  it('"Istanbul" (real port) → vague:false', () => {
    expect(isVagueRegion('Istanbul').vague).toBe(false);
  });
});
