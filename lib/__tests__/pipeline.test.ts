import { PIPELINE_STEPS, STEP_GROUPS } from '../pipeline';

describe('PIPELINE_STEPS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(PIPELINE_STEPS)).toBe(true);
    expect(PIPELINE_STEPS.length).toBeGreaterThan(0);
  });

  it('every step has label (string) and endpoint (string)', () => {
    for (const step of PIPELINE_STEPS) {
      expect(typeof step.label).toBe('string');
      expect(step.label.length).toBeGreaterThan(0);
      expect(typeof step.endpoint).toBe('string');
      expect(step.endpoint.length).toBeGreaterThan(0);
    }
  });

  it('first step endpoint is /api/emails/fetch', () => {
    expect(PIPELINE_STEPS[0].endpoint).toBe('/api/emails/fetch');
  });

  it('equals STEP_GROUPS.flatMap(g => g.steps)', () => {
    const derived = STEP_GROUPS.flatMap(g => g.steps);
    expect(PIPELINE_STEPS).toEqual(derived);
  });
});

describe('STEP_GROUPS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(STEP_GROUPS)).toBe(true);
    expect(STEP_GROUPS.length).toBeGreaterThan(0);
  });

  it('groups with parallel: true have multiple steps', () => {
    const parallelGroups = STEP_GROUPS.filter(g => g.parallel === true);
    expect(parallelGroups.length).toBeGreaterThan(0);
    for (const group of parallelGroups) {
      expect(group.steps.length).toBeGreaterThan(1);
    }
  });
});
