import { scoreCranes } from '@/lib/sailing/fit-breakdown';

// Port data from data/ports/port-master.json:
//   Constanta (RO) → hasShoreCranes: true
//   Karasu (TR)    → hasShoreCranes: true
//   Skikda (DZ)    → hasShoreCranes: false
//   Felixstowe (GB)→ hasShoreCranes: false

describe('scoreCranes — discharge port participates', () => {
  it('geared vessel ignores both ports → full points', () => {
    const c = scoreCranes(true, 'Constanta', 'Novorossiysk');
    expect(c.score).toBe(6);
  });

  it('gearless, cranes only at discharge → 85% and rationale names discharge port', () => {
    // load: Skikda (no cranes), discharge: Constanta (has cranes)
    const c = scoreCranes(false, 'Skikda', 'Constanta');
    expect(Math.round((c.score / c.weight) * 100)).toBe(85);
    expect(c.rationale.toLowerCase()).toContain('discharge');
    expect(c.rationale).toContain('Constanta');
  });

  it('gearless, neither port has cranes → 0', () => {
    const c = scoreCranes(false, 'Skikda', 'Felixstowe');
    expect(c.score).toBe(0);
  });

  it('gearless, both unknown → conservative 55%', () => {
    const c = scoreCranes(false, null, null);
    expect(Math.round((c.score / c.weight) * 100)).toBe(55);
  });
});
