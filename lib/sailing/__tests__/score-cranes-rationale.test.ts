import { scoreCranes } from '@/lib/sailing/fit-breakdown';

// Constanta (ROCND) has: craneSWL=50, craneType=gantry,
// terminalOperator='DP World Constanta', craneDataAsOf='2025-Q4'
// Skikda (DZ) has: hasShoreCranes=false, no craneSWL
// Felixstowe (GB) has: hasShoreCranes=false, no craneSWL
// Karasu (TR) has: hasShoreCranes=true, craneSWL data from WPI, no terminalOperator

describe('scoreCranes — SWL + operator rationale enrichment (Stage 4)', () => {
  it('gearless, discharge=Constanta — rationale includes SWL, operator, date, disclaimer', () => {
    const c = scoreCranes(false, 'Skikda', 'Constanta');
    expect(c.rationale.toLowerCase()).toContain('swl');
    expect(c.rationale).toContain('DP World Constanta');
    expect(c.rationale).toContain('2025-Q4');
    expect(c.rationale.toLowerCase()).toContain('confirm with port agent');
  });

  it('gearless, load=Rotterdam — rationale includes operator and disclaimer', () => {
    const c = scoreCranes(false, 'Rotterdam', 'Skikda');
    expect(c.rationale).toContain('Port of Rotterdam Authority');
    expect(c.rationale.toLowerCase()).toContain('confirm with port agent');
  });

  it('gearless, port with cranes but no crane data — rationale unchanged (no dangling disclaimer)', () => {
    // Karasu has hasShoreCranes=true but no terminalOperator
    // Use null ports — the 55% case has no operator to show
    const c = scoreCranes(false, null, null);
    expect(c.rationale).not.toContain('SWL');
    expect(c.rationale.toLowerCase()).not.toContain('confirm with port agent');
  });

  it('geared vessel — rationale unchanged, no disclaimer', () => {
    const c = scoreCranes(true, 'Constanta', 'Rotterdam');
    expect(c.rationale).toBe('Ship is geared — no dependence on shore cranes.');
    expect(c.rationale.toLowerCase()).not.toContain('confirm with port agent');
  });

  it('score values unchanged vs discharge-baseline (PI3 guard)', () => {
    // geared → 6 (full weight)
    const geared = scoreCranes(true, 'Constanta', 'Novorossiysk');
    expect(geared.score).toBe(6);

    // gearless, discharge cranes → 85%
    const dischCranes = scoreCranes(false, 'Skikda', 'Constanta');
    expect(Math.round((dischCranes.score / dischCranes.weight) * 100)).toBe(85);

    // gearless, neither → 0
    const noCranes = scoreCranes(false, 'Skikda', 'Felixstowe');
    expect(noCranes.score).toBe(0);

    // gearless, both unknown → 55%
    const unknown = scoreCranes(false, null, null);
    expect(Math.round((unknown.score / unknown.weight) * 100)).toBe(55);
  });
});
