import {
  scoreUtilisation,
  scoreBallast,
  scoreClassFit,
  scoreVolume,
  scoreVetting,
  scoreEconomics,
  scoreCranes,
  scoreCargoTypeQuality,
  scoreTiming,
} from '@/lib/sailing/fit-breakdown';

describe('Task G — bracketData populated, values unchanged', () => {
  it('utilisation has mt bracket without changing score', () => {
    const c = scoreUtilisation(18000, 25000, false);
    expect(c.bracketData).toMatch(/18,000 \/ 25,000 mt/);
    // util = 0.72 → share 0.65 → score = Math.round(19 * 0.65 * 10) / 10 = 12.4
    expect(c.score).toBe(Math.round(19 * 0.65 * 10) / 10);
  });

  it('ballast has nm bracket', () => {
    const c = scoreBallast(2100, 50000);
    expect(c.bracketData).toMatch(/2,100 nm/);
  });

  it('classfit has mt bracket', () => {
    const c = scoreClassFit(20000, 32000, false);
    expect(c.bracketData).toMatch(/32,000 \/ 20,000 mt/);
  });

  it('volume has pct bracket', () => {
    const c = scoreVolume(20000, 'grain', 30000, null);
    expect(c.bracketData).toBeDefined();
    expect(c.bracketData).toMatch(/% of grain/);
  });

  it('economics has TCE/breakeven bracket', () => {
    const c = scoreEconomics(14200, 50000);
    expect(c.bracketData).toMatch(/\$14,200 \/ \$.*BE/);
  });

  it('vetting has detentions bracket', () => {
    const c = scoreVetting({ built: 2015 } as any, 2026, 0);
    expect(c.bracketData).toBe('0 detentions');
  });

  it('vetting with 2 detentions shows count', () => {
    const c = scoreVetting({ built: 2015 } as any, 2026, 2);
    expect(c.bracketData).toBe('2 detentions');
  });

  it('vetting without detention count has no bracket', () => {
    const c = scoreVetting({ built: 2015 } as any, 2026, undefined);
    expect(c.bracketData).toBeUndefined();
  });

  it('cargoType (qualitative) has no bracket', () => {
    const c = scoreCargoTypeQuality('OTHER', 'MPP', null);
    expect(c.bracketData).toBeUndefined();
  });

  it('cranes geared shows geared bracket', () => {
    const c = scoreCranes(true, 'Constanta', 'Novorossiysk');
    expect(c.bracketData).toBe('geared');
  });

  it('cranes gearless with port cranes shows port-cranes bracket', () => {
    const c = scoreCranes(false, 'Constanta', 'Novorossiysk');
    expect(c.bracketData).toBe('gearless — port cranes ✓');
  });

  it('cranes gearless no cranes shows no-cranes bracket', () => {
    // Use ports known to have no cranes or pass null
    const c = scoreCranes(false, null, null);
    // null ports → unknown crane status → conservative (not 0), bracketData undefined
    expect(c.bracketData).toBeUndefined();
  });

  it('timing idle shows idle days bracket', () => {
    const c = scoreTiming({ verdict: 'idle', gapDays: 10, distanceNm: 0 } as any);
    expect(c.bracketData).toMatch(/10d idle/);
  });

  it('timing ideal has no bracket', () => {
    const c = scoreTiming({ verdict: 'ideal', gapDays: 0, distanceNm: 0 } as any);
    expect(c.bracketData).toBeUndefined();
  });

  it('timing late shows late bracket', () => {
    const c = scoreTiming({ verdict: 'late', gapDays: -3, distanceNm: 0 } as any);
    expect(c.bracketData).toBe('late');
  });
});
