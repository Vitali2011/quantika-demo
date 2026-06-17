import {
  checkDraft,
  checkCrane,
  checkVolume,
  checkCargoVesselCompat,
  checkCargoWeight,
  checkImsbc,
  checkVesselDwtRange,
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

  // Layer C: gearless + breakbulk + unverified port cranes → amber warning
  it('gearless + BREAK_BULK + unknown port cranes → warning (amber), not green OK', () => {
    // 'Atlantis' is unknown port → portHasShoreCranes returns null (unverified)
    const r = checkCrane('Atlantis', false, 'BREAK_BULK');
    expect(r.pass).toBe(true);
    expect(r.warning).toBe(true);
    expect(r.reason).toMatch(/confirm.cranes/i);
  });

  it('gearless + BULK (not breakbulk) + unknown port cranes → no warning (bulk terminals fine)', () => {
    const r = checkCrane('Atlantis', false, 'BULK');
    expect(r.pass).toBe(true);
    expect(r.warning).toBeFalsy();
  });

  it('gearless + BREAK_BULK + port cranes confirmed (Mykolaiv) → green OK, no warning', () => {
    const r = checkCrane('Mykolaiv', false, 'BREAK_BULK');
    expect(r.pass).toBe(true);
    expect(r.warning).toBeFalsy();
  });

  it('geared vessel + BREAK_BULK → green OK, no warning', () => {
    const r = checkCrane('Atlantis', true, 'BREAK_BULK');
    expect(r.pass).toBe(true);
    expect(r.warning).toBeFalsy();
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

  it('#884: hrc and coil have steel-band stowage factor (~0.45)', () => {
    expect(STOWAGE_FACTORS.hrc).toBe(0.45);
    expect(STOWAGE_FACTORS.coil).toBe(0.45);
  });
});

describe('#884 — HRC cargo no false overflow', () => {
  it('HRC 3200 MT on 3994 CBM vessel passes volume check (sf 0.45, not default 1.35)', () => {
    // Before fix: 3200 × 1.35 = 4320 > 3994 × 1.05 = 4194 → fail
    // After fix:  3200 × 0.45 = 1440 ≤ 4194 → pass
    const r = checkVolume({
      weightMt: 3200,
      cargoDescription: 'Hot Rolled Coils (HRC)',
      stowageFactor: null,
      grainCapacity: 3994,
    });
    expect(r.pass).toBe(true);
  });

  it('#884: "coil" keyword resolves to steel-coil stowage factor, not default 1.35', () => {
    const r = checkVolume({
      weightMt: 3200,
      cargoDescription: 'steel coils',
      stowageFactor: null,
      grainCapacity: 3994,
    });
    expect(r.pass).toBe(true);
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
  it('lightly-loaded vessel (3000t on 10k DWT): laden ~5.5m within Mykolaiv 10.5m — passes despite static 12m max draft', () => {
    // PI3 re-derive (M3): laden = 0.4991×10000^0.2991 × (0.3)^0.3 ≈ 7.85×0.697 ≈ 5.5m < 10.5m → pass
    // static draftMax=12.0 would have failed pre-M3; laden-gate correctly passes
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      destinationPort: 'Mykolaiv',
      weightMt: 3000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 12.0,
      grainCapacity: 6000,
      dwtSummer: 10000,
      dwcc: null,
    });
    expect(r.checks.destDraft.pass).toBe(true);
    expect(r.checks.draft.pass).toBe(true);
    expect(r.pass).toBe(true);
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

// ────────────────────────────────────────────────────────────────────────────
// IMSBC hard-gate (checkImsbc)
// ────────────────────────────────────────────────────────────────────────────

describe('checkImsbc — hard-gate', () => {
  it('Group C cargo → always passes', () => {
    const r = checkImsbc('wheat');
    expect(r.pass).toBe(true);
  });

  it('Group A cargo (iron ore) + DG restriction → passes (group A is not hard-blocked)', () => {
    const r = checkImsbc('iron ore', ['no dangerous goods']);
    expect(r.pass).toBe(true);
  });

  it('Group B cargo + no vessel restrictions → passes (caution only, not block)', () => {
    const r = checkImsbc('coal', []);
    expect(r.pass).toBe(true);
  });

  it('Group B cargo + DG restriction → blocked', () => {
    const r = checkImsbc('coal', ['no dangerous goods']);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/vessel restrictions/i);
  });

  it('DRI + self-heating restriction → blocked', () => {
    const r = checkImsbc('dri', ['no self-heating cargo', 'gearless']);
    expect(r.pass).toBe(false);
  });

  it('unknown cargo + DG restriction → passes (unknown is neutral)', () => {
    const r = checkImsbc('exotic pellets', ['no dangerous goods']);
    expect(r.pass).toBe(true);
  });

  it('null cargo description → passes (graceful)', () => {
    const r = checkImsbc(null, ['no dangerous goods']);
    expect(r.pass).toBe(true);
  });

  it('Group A cargo on a no-concentrates vessel fails the IMSBC hard gate (audit C.3)', () => {
    const r = checkImsbc('nickel ore', ['no concentrates']);
    expect(r.pass).toBe(false);
  });
});

describe('runHardFilters — IMSBC integration', () => {
  it('Group B cargo + vessel DG restriction → runHardFilters fails', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: null,
      weightMt: null,
      cargoDescription: 'coal',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: null,
      grainCapacity: null,
      dwtSummer: null,
      dwcc: null,
      vesselRestrictions: ['no dangerous goods'],
    });
    expect(r.pass).toBe(false);
    expect(r.checks.imsbc.pass).toBe(false);
    expect(r.failures.some((f) => /vessel restrictions/i.test(f))).toBe(true);
  });

  it('Group B cargo + no restrictions → runHardFilters passes (caution only)', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: null,
      weightMt: null,
      cargoDescription: 'coal',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: null,
      grainCapacity: null,
      dwtSummer: null,
      dwcc: null,
      vesselRestrictions: [],
    });
    expect(r.pass).toBe(true);
    expect(r.checks.imsbc.pass).toBe(true);
  });

  it('Group A cargo (iron ore) + DG restriction → runHardFilters passes (A not blocked)', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: null,
      weightMt: null,
      cargoDescription: 'iron ore',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: null,
      grainCapacity: null,
      dwtSummer: null,
      dwcc: null,
      vesselRestrictions: ['no dangerous goods'],
    });
    expect(r.pass).toBe(true);
    expect(r.checks.imsbc.pass).toBe(true);
  });

  it('vesselRestrictions undefined → runHardFilters passes gracefully', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: null,
      weightMt: null,
      cargoDescription: 'coal',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: null,
      grainCapacity: null,
      dwtSummer: null,
      dwcc: null,
    });
    expect(r.pass).toBe(true);
    expect(r.checks.imsbc.pass).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// M3: laden-draft gate — checkDraftLaden wired into runHardFilters
// Hand-derived: 58k DWT + 52k cargo → fullLoad≈13.27m → laden≈12.84m → ceil→12.9m
// Alexandria maxDraftM=12.5m, Rotterdam=24m, Mykolaiv=10.5m
// ────────────────────────────────────────────────────────────────────────────

describe('runHardFilters — laden-draft gate (M3)', () => {
  it('catches overdraft: static passes (11m < 12.5m) but laden 12.9m > Alexandria 12.5m → fail', () => {
    // Research §5 worked example: Handymax 58k DWT, 52k grain, 12.5m discharge limit
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Rotterdam',    // 24m limit — origin passes
      destinationPort: 'Alexandria', // 12.5m limit — laden 12.9m fails
      weightMt: 52000,
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 11.0,             // static 11m would pass Alexandria 12.5m
      grainCapacity: 70000,
      dwtSummer: 58000,
      dwcc: null,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.destDraft.pass).toBe(false);
    expect(r.checks.destDraft.reason).toMatch(/laden.*draft|draft.*laden/i);
    expect(r.checks.destDraft.reason).toMatch(/12\.[5-9]|13/);
    expect(r.failures.some((f) => /laden|estimated/i.test(f))).toBe(true);
  });

  it('fallback: cargo unknown → static check → passes (static 11m < 12.5m Alexandria)', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Rotterdam',
      destinationPort: 'Alexandria',
      weightMt: null,              // no cargo weight → estimateLadenDraft returns null
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 11.0,
      grainCapacity: 70000,
      dwtSummer: 58000,
      dwcc: null,
    });
    expect(r.checks.destDraft.pass).toBe(true);
  });

  it('unknown port → passes gracefully (unchanged)', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'PortAtlantis',
      destinationPort: 'PortAtlantis',
      weightMt: 52000,
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 11.0,
      grainCapacity: 70000,
      dwtSummer: 58000,
      dwcc: null,
    });
    expect(r.checks.draft.pass).toBe(true);
    expect(r.checks.destDraft.pass).toBe(true);
  });

  it('destDraft fails on tighter dest port: Rotterdam→Mykolaiv, laden 12.9m > 10.5m', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Rotterdam',      // 24m — origin passes
      destinationPort: 'Mykolaiv',  // 10.5m — laden 12.9m fails
      weightMt: 52000,
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 11.0,               // static would pass Mykolaiv at 10.5m… but wait no: 11>10.5
      grainCapacity: 70000,
      dwtSummer: 58000,
      dwcc: null,
    });
    // static 11m already fails Mykolaiv (10.5m) but the laden check reason differs
    expect(r.checks.destDraft.pass).toBe(false);
    expect(r.checks.draft.pass).toBe(true);   // Rotterdam passes laden 12.9m < 24m
  });

  it('FilterResult carries estimatedLadenDraftM and portLimitM when laden check used', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Rotterdam',
      destinationPort: 'Alexandria',
      weightMt: 52000,
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 11.0,
      grainCapacity: 70000,
      dwtSummer: 58000,
      dwcc: null,
    });
    // origin Rotterdam passes with laden estimate
    expect(r.checks.draft.estimatedLadenDraftM).toBeCloseTo(12.9, 1);
    expect(r.checks.draft.portLimitM).toBe(24);
    // dest Alexandria fails with laden estimate
    expect(r.checks.destDraft.estimatedLadenDraftM).toBeCloseTo(12.9, 1);
    expect(r.checks.destDraft.portLimitM).toBe(12.5);
  });

  it('fallback portLimitM: estimate=null (unknown cargo) → portLimitM still populated from port data', () => {
    // Option C: checkDraftLaden fallback path now returns portLimitM even when estimate is null
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Rotterdam',    // maxDraftM=24
      destinationPort: 'Alexandria', // maxDraftM=12.5
      weightMt: null,             // unknown → estimate=null → fallback path
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 11.0,
      grainCapacity: 70000,
      dwtSummer: 58000,
      dwcc: null,
    });
    expect(r.checks.draft.pass).toBe(true);
    expect(r.checks.destDraft.pass).toBe(true);
    // portLimitM must be populated even in the estimate=null fallback path
    expect(r.checks.draft.portLimitM).toBe(24);
    expect(r.checks.destDraft.portLimitM).toBe(12.5);
  });

  it('fallback portLimitM: estimate=null, unknown port → portLimitM stays null (graceful)', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'PortAtlantis',
      destinationPort: 'PortAtlantis',
      weightMt: null,
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 11.0,
      grainCapacity: 70000,
      dwtSummer: 58000,
      dwcc: null,
    });
    expect(r.checks.draft.pass).toBe(true);
    expect(r.checks.destDraft.pass).toBe(true);
    expect(r.checks.draft.portLimitM).toBeUndefined();
    expect(r.checks.destDraft.portLimitM).toBeUndefined();
  });
});

describe('checkVesselDwtRange (soft gate — #1023)', () => {
  it('flags vessel below the requested band', () => {
    // GRAIN TRADER P wants 12-14k dwt; SEAGULL 71 is 8,100 dwt
    const r = checkVesselDwtRange({ vesselDwt: 8100, minVesselDwtMt: 12000, maxVesselDwtMt: 14000 });
    expect(r.stated).toBe(true);
    expect(r.inRange).toBe(false);
    expect(r.reason).toMatch(/outside required DWT/i);
  });

  it('flags vessel above the requested band', () => {
    const r = checkVesselDwtRange({ vesselDwt: 20000, minVesselDwtMt: 12000, maxVesselDwtMt: 14000 });
    expect(r.inRange).toBe(false);
  });

  it('passes a vessel inside the band', () => {
    const r = checkVesselDwtRange({ vesselDwt: 13000, minVesselDwtMt: 12000, maxVesselDwtMt: 14000 });
    expect(r.stated).toBe(true);
    expect(r.inRange).toBe(true);
  });

  it('passes within 5% tolerance of the band edges', () => {
    const r = checkVesselDwtRange({ vesselDwt: 11500, minVesselDwtMt: 12000, maxVesselDwtMt: 14000 });
    expect(r.inRange).toBe(true); // 12000*0.95 = 11400 ≤ 11500
  });

  it('is neutral when no DWT band stated', () => {
    const r = checkVesselDwtRange({ vesselDwt: 8100, minVesselDwtMt: null, maxVesselDwtMt: null });
    expect(r.stated).toBe(false);
    expect(r.inRange).toBe(true);
  });

  it('cannot disprove when vessel DWT unknown', () => {
    const r = checkVesselDwtRange({ vesselDwt: null, minVesselDwtMt: 12000, maxVesselDwtMt: 14000 });
    expect(r.stated).toBe(true);
    expect(r.inRange).toBe(true);
  });
});

describe('runHardFilters — vesselDwtRange is SOFT (does not exclude)', () => {
  it('out-of-band vessel still passes hard filters but reports vesselDwtRange', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: null,
      destinationPort: null,
      weightMt: null,
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'Handysize Bulker',
      geared: true,
      draftMax: null,
      grainCapacity: null,
      dwtSummer: 8100,
      dwcc: null,
      cargoMinVesselDwtMt: 12000,
      cargoMaxVesselDwtMt: 14000,
    });
    expect(r.checks.vesselDwtRange?.stated).toBe(true);
    expect(r.checks.vesselDwtRange?.inRange).toBe(false);
    // SOFT: the out-of-band condition must NOT fail the overall hard-filter gate
    expect(r.pass).toBe(true);
    expect(r.failures).not.toContain(r.checks.vesselDwtRange?.reason);
  });
});
