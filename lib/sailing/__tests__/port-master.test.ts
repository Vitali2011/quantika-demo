import { getPortMaster, portCanHandleDraft, portHasShoreCranes } from '../port-master';

describe('getPortMaster', () => {
  it('returns master data for Karasu', () => {
    const m = getPortMaster('Karasu');
    expect(m).not.toBeNull();
    expect(m!.maxDraftM).toBeGreaterThan(0);
    expect(m!.hasShoreCranes).toBeDefined();
  });

  it('works with aliases (Odessa → Odesa)', () => {
    const a = getPortMaster('Odessa');
    const b = getPortMaster('Odesa');
    expect(a).toEqual(b);
  });

  it('case-insensitive', () => {
    expect(getPortMaster('karasu')).toEqual(getPortMaster('Karasu'));
  });

  it('returns null for unknown port', () => {
    expect(getPortMaster('Atlantis')).toBeNull();
    expect(getPortMaster('')).toBeNull();
    expect(getPortMaster(null)).toBeNull();
  });
});

describe('portCanHandleDraft', () => {
  it('Mykolaiv (shallow, ~10m) accepts 6m vessel', () => {
    const r = portCanHandleDraft('Mykolaiv', 6.0);
    expect(r.ok).toBe(true);
  });

  it('Mykolaiv rejects 12m vessel (over river draft)', () => {
    const r = portCanHandleDraft('Mykolaiv', 12.0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/draft/i);
  });

  it('unknown port → ok=true, reason="unknown"', () => {
    const r = portCanHandleDraft('Atlantis', 6.0);
    expect(r.ok).toBe(true);
    expect(r.reason).toMatch(/unknown/i);
  });

  it('null draft → ok=true (cannot check, not fail)', () => {
    const r = portCanHandleDraft('Mykolaiv', null);
    expect(r.ok).toBe(true);
  });
});

describe('portHasShoreCranes', () => {
  it('Mykolaiv has shore cranes', () => {
    expect(portHasShoreCranes('Mykolaiv')).toBe(true);
  });

  it('Bayonne (general purpose) has cranes', () => {
    expect(portHasShoreCranes('Bayonne')).toBe(true);
  });

  it('unknown port → null (not known either way)', () => {
    expect(portHasShoreCranes('Atlantis')).toBeNull();
  });
});
