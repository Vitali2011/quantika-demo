import {
  checkDraft,
  checkCrane,
  checkVolume,
  checkCargoVesselCompat,
  checkCargoWeight,
  runHardFilters,
  STOWAGE_FACTORS,
} from '../match-filters';

describe('checkCargoWeight', () => {
  it('rejects when cargo weight far exceeds vessel DWT (no DWCC)', () => {
    // N1 from R0 corpus: cargo 55000 mt × vessel 32131 dwt — ratio 1.71
    const r = checkCargoWeight({ weightMt: 55000, dwtSummer: 32131, dwcc: null });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/exceeds vessel capacity/i);
  });

  it('rejects when cargo weight far exceeds vessel DWT (small vessel)', () => {
    // N2 from R0 corpus: cargo 12000 mt × vessel 2570 dwt — ratio 4.67
    const r = checkCargoWeight({ weightMt: 12000, dwtSummer: 2570, dwcc: null });
    expect(r.pass).toBe(false);
  });

  it('prefers DWCC over DWT when both present', () => {
    // DWCC 2000 means real cargo capacity is 2000, not 2570; cargo 2400 still fits within 5% margin
    const r = checkCargoWeight({ weightMt: 2050, dwtSummer: 2570, dwcc: 2000 });
    expect(r.pass).toBe(true);
  });

  it('rejects via DWCC when cargo clearly exceeds true cargo capacity', () => {
    const r = checkCargoWeight({ weightMt: 2500, dwtSummer: 2570, dwcc: 2000 });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/DWCC/);
  });

  it('passes when cargo weight equals DWCC within margin', () => {
    const r = checkCargoWeight({ weightMt: 2000, dwtSummer: 2570, dwcc: 2000 });
    expect(r.pass).toBe(true);
  });

  it('passes when cargo weight is within DWT × 0.90 capacity', () => {
    // dwt 10000 × 0.90 = 9000 effective; cargo 5000 fits
    const r = checkCargoWeight({ weightMt: 5000, dwtSummer: 10000, dwcc: null });
    expect(r.pass).toBe(true);
  });

  it('passes when cargo weightMt is null (unknown — graceful)', () => {
    const r = checkCargoWeight({ weightMt: null, dwtSummer: 5000, dwcc: null });
    expect(r.pass).toBe(true);
  });

  it('passes when both DWT and DWCC are null (unknown vessel capacity — graceful)', () => {
    const r = checkCargoWeight({ weightMt: 5000, dwtSummer: null, dwcc: null });
    expect(r.pass).toBe(true);
  });

  it('uses max of weightMt range for conservative check', () => {
    // range 4000-6000, vessel 5000 DWT (capacity 4500 effective) — should reject
    const r = checkCargoWeight({ weightMt: { min: 4000, max: 6000 }, dwtSummer: 5000, dwcc: null });
    expect(r.pass).toBe(false);
  });

  it('5% margin tolerance: cargo 5200 vs DWCC 5000 = pass (within margin)', () => {
    const r = checkCargoWeight({ weightMt: 5200, dwtSummer: null, dwcc: 5000 });
    expect(r.pass).toBe(true);
  });

  it('5% margin tolerance: cargo 5300 vs DWCC 5000 = fail (exceeds margin)', () => {
    const r = checkCargoWeight({ weightMt: 5300, dwtSummer: null, dwcc: 5000 });
    expect(r.pass).toBe(false);
  });
});

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
      dwtSummer: 10000,
      dwcc: null,
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
      dwtSummer: null,
      dwcc: null,
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
      dwtSummer: null,
      dwcc: null,
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
      dwtSummer: null,
      dwcc: null,
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
      dwtSummer: null,
      dwcc: null,
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
      dwtSummer: null,
      dwcc: null,
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
      dwtSummer: null,
      dwcc: null,
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
      dwtSummer: null,
      dwcc: null,
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
      dwtSummer: null,
      dwcc: null,
    });
    expect(r.pass).toBe(false);
    expect(r.failures.length).toBeGreaterThanOrEqual(2); // draft + volume
  });
});
