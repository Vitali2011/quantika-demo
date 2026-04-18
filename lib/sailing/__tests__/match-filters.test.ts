import {
  checkDraft,
  checkCrane,
  checkVolume,
  checkCargoVesselCompat,
  runHardFilters,
  STOWAGE_FACTORS,
} from '../match-filters';

describe('checkDraft', () => {
  it('fails when vessel draft exceeds port max', () => {
    const r = checkDraft('Mykolaiv', 12.0);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/draft/i);
  });

  it('passes when within limits', () => {
    const r = checkDraft('Mykolaiv', 6.0);
    expect(r.pass).toBe(true);
  });

  it('passes when port unknown (graceful)', () => {
    const r = checkDraft('Atlantis', 6.0);
    expect(r.pass).toBe(true);
  });

  it('passes when vessel draft unknown (graceful)', () => {
    const r = checkDraft('Mykolaiv', null);
    expect(r.pass).toBe(true);
  });
});

describe('checkCrane', () => {
  it('gearless vessel + port with cranes = pass', () => {
    const r = checkCrane('Mykolaiv', false);
    expect(r.pass).toBe(true);
  });

  it('gearless vessel + port WITHOUT cranes = fail', () => {
    const r = checkCrane('Skikda', false);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/crane|gearless/i);
  });

  it('geared vessel + any port = pass', () => {
    expect(checkCrane('Mykolaiv', true).pass).toBe(true);
    expect(checkCrane('Skikda', true).pass).toBe(true);
  });

  it('geared status unknown → pass (graceful)', () => {
    const r = checkCrane('Skikda', null);
    expect(r.pass).toBe(true);
  });

  it('port unknown → pass (graceful)', () => {
    const r = checkCrane('Atlantis', false);
    expect(r.pass).toBe(true);
  });
});

describe('checkVolume', () => {
  it('wheat 5000 MT × 1.3 m³/t = 6500 m³ > grain cap 5100 → fail', () => {
    const r = checkVolume({ weightMt: 5000, cargoDescription: 'wheat', stowageFactor: null, grainCapacity: 5100 });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/volume|capacity|stowage/i);
  });

  it('wheat 4000 MT × 1.3 = 5200 m³ < 6200 cap → pass', () => {
    const r = checkVolume({ weightMt: 4000, cargoDescription: 'wheat', stowageFactor: null, grainCapacity: 6200 });
    expect(r.pass).toBe(true);
  });

  it('explicit stowage factor overrides default', () => {
    const r = checkVolume({ weightMt: 5000, cargoDescription: 'unknown', stowageFactor: '1.5', grainCapacity: 6000 });
    expect(r.pass).toBe(false);
  });

  it('unknown cargo → uses conservative default, still passes for light loads', () => {
    const r = checkVolume({ weightMt: 3000, cargoDescription: 'something exotic', stowageFactor: null, grainCapacity: 5100 });
    expect(r.pass).toBe(true);
  });

  it('missing grain_capacity → pass (cannot check)', () => {
    const r = checkVolume({ weightMt: 5000, cargoDescription: 'wheat', stowageFactor: null, grainCapacity: null });
    expect(r.pass).toBe(true);
  });

  it('missing weight → pass (cannot check)', () => {
    const r = checkVolume({ weightMt: null, cargoDescription: 'wheat', stowageFactor: null, grainCapacity: 5100 });
    expect(r.pass).toBe(true);
  });
});

describe('STOWAGE_FACTORS', () => {
  it('has common bulk cargoes', () => {
    expect(STOWAGE_FACTORS.wheat).toBeGreaterThan(1);
    expect(STOWAGE_FACTORS.steel).toBeLessThan(1);
    expect(STOWAGE_FACTORS.cement).toBeDefined();
    expect(STOWAGE_FACTORS.fertilizer).toBeDefined();
  });
});

describe('checkCargoVesselCompat', () => {
  it('BULK cargo + bulk carrier = pass', () => {
    const r = checkCargoVesselCompat({ cargoType: 'BULK', vesselType: 'bulk carrier' });
    expect(r.pass).toBe(true);
  });

  it('PROJECT cargo + bulk carrier = fail', () => {
    const r = checkCargoVesselCompat({ cargoType: 'PROJECT', vesselType: 'bulk carrier' });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/project|MPP|heavy-lift/i);
  });

  it('BREAK_BULK + MPP = pass', () => {
    const r = checkCargoVesselCompat({ cargoType: 'BREAK_BULK', vesselType: 'MPP' });
    expect(r.pass).toBe(true);
  });

  it('BULK + MPP = pass (MPP is flexible)', () => {
    const r = checkCargoVesselCompat({ cargoType: 'BULK', vesselType: 'MPP' });
    expect(r.pass).toBe(true);
  });

  it('RORO cargo type + bulk carrier = fail', () => {
    const r = checkCargoVesselCompat({ cargoType: 'RORO', vesselType: 'bulk carrier' });
    expect(r.pass).toBe(false);
  });

  it('unknown vesselType → pass (graceful)', () => {
    const r = checkCargoVesselCompat({ cargoType: 'BULK', vesselType: null });
    expect(r.pass).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Destination port checks (spec-01)
// ────────────────────────────────────────────────────────────────────────────

describe('runHardFilters — destination port draft', () => {
  it('fails when vessel draft exceeds destination port max draft', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      destinationPort: 'Mykolaiv',
      weightMt: 3000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 12.0,   // exceeds Mykolaiv maxDraftM=10.5
      grainCapacity: 6000,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.destDraft.pass).toBe(false);
    expect(r.checks.destDraft.reason).toMatch(/draft/i);
    expect(r.failures.some((f) => /draft/i.test(f))).toBe(true);
  });

  it('fails when vessel draft exceeds destination port max but origin port is fine', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Rotterdam',   // deep-sea port, handles large drafts
      destinationPort: 'Mykolaiv', // river port maxDraftM=10.5
      weightMt: 3000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 12.0,
      grainCapacity: 6000,
    });
    expect(r.checks.destDraft.pass).toBe(false);
    expect(r.pass).toBe(false);
  });

  it('passes when destination port is null (graceful)', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      destinationPort: null,
      weightMt: 3000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 12.0,
      grainCapacity: 6000,
    });
    expect(r.checks.destDraft.pass).toBe(true);
    expect(r.checks.destCrane.pass).toBe(true);
  });

  it('passes when destination port is unknown (graceful)', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      destinationPort: 'PortAtlantis',
      weightMt: 3000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: false,
      draftMax: 12.0,
      grainCapacity: 6000,
    });
    expect(r.checks.destDraft.pass).toBe(true);
    expect(r.checks.destCrane.pass).toBe(true);
  });
});

describe('runHardFilters — destination port crane', () => {
  it('fails when gearless vessel bound for destination port with no cranes', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      destinationPort: 'Skikda',  // hasShoreCranes=false
      weightMt: 3000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: false,
      draftMax: 6.0,
      grainCapacity: 6000,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.destCrane.pass).toBe(false);
    expect(r.checks.destCrane.reason).toMatch(/crane|gearless/i);
  });

  it('passes when geared vessel bound for destination port with no cranes', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      destinationPort: 'Skikda',
      weightMt: 3000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 6.0,
      grainCapacity: 6000,
    });
    expect(r.checks.destCrane.pass).toBe(true);
  });

  it('collects both destDraft and destCrane failures in failures array', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Rotterdam',
      destinationPort: 'Skikda',   // maxDraftM=12, hasShoreCranes=false
      weightMt: 3000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: false,
      draftMax: 13.0,   // exceeds Skikda maxDraftM=12
      grainCapacity: 6000,
    });
    expect(r.checks.destDraft.pass).toBe(false);
    expect(r.checks.destCrane.pass).toBe(false);
    expect(r.failures.length).toBeGreaterThanOrEqual(2);
  });
});

describe('runHardFilters', () => {
  it('returns pass=true with no failures for compatible pair', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      weightMt: 4000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 6.0,
      grainCapacity: 6000,
    });
    expect(r.pass).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it('collects multiple failures', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      weightMt: 5000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: false,         // ok, Mykolaiv has cranes
      draftMax: 12.0,        // too deep
      grainCapacity: 5000,   // too small for 5000 MT wheat
    });
    expect(r.pass).toBe(false);
    expect(r.failures.length).toBeGreaterThanOrEqual(2); // draft + volume
  });
});
