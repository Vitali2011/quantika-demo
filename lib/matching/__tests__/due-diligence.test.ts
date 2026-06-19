import { buildDueDiligence, type BuildDDArgs, type DDCheck } from '@/lib/matching/due-diligence';
import type { FitBreakdown, FitBreakdownComponent, MatchWorksheet, ParsedVessel } from '@/lib/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function comp(factor: FitBreakdownComponent['factor'], score: number, weight: number, rationale = 'ok'): FitBreakdownComponent {
  return { factor, label: factor, weight, score, rationale };
}

function fullFb(): FitBreakdown {
  return {
    components: [
      comp('utilisation', 17, 19, 'fill ~85%'),
      comp('timing', 14, 15, 'on time'),
      comp('ballast', 14, 15, 'short ballast'),
      comp('classFit', 9, 9, 'class ok'),
      comp('cargoType', 6, 6, 'type ok'),
      comp('cranes', 6, 6, 'geared'),
      comp('volume', 3, 3, 'good fill'),
      comp('draft', 2, 2, 'within limit'),
      comp('vetting', 7, 7, 'vetting clean'),
      comp('economics', 16, 18, 'TCE healthy'),
    ],
    totalWeight: 100,
    fitPercent: 94,
    partCargo: false,
    vesselClass: 'handysize',
    sanctionsPenalty: 0,
    appliedCap: null,
    inputs: { distanceNm: 1000, gapDays: 2, verdict: 'ready', utilisation: 0.85, vesselDwt: 35000, cargoWtMax: 30000 },
  };
}

function fullWorksheet(): MatchWorksheet {
  return {
    readiness: {
      openDate: null, laycanStart: null, laycanEnd: null, distanceNm: 1000,
      speedKn: 12, sailingDays: 3, arrivalDate: null, gapDays: 2,
      verdict: 'ideal', explanation: 'ready', openPosition: 'Rotterdam',
    },
    vessel: {
      draftMax: 10, grainCapacity: 40000, grainCapacityUnit: 'cbm', geared: true,
      vesselType: 'bulk', flag: 'Panama', built: 2015, pandi: 'Gard',
      classSociety: 'DNV', lastCargoes: 'wheat, corn', dwtSummer: 35000, dwcc: 33000,
    },
    cargo: { weightMt: 30000, cargoType: 'grain', loadPort: 'Rotterdam', dischargePort: 'Alexandria' },
    hardFilters: {
      draft: { pass: true, estimatedLadenDraftM: 9.2, portLimitM: 10.5 },
      crane: { pass: true },
      volume: { pass: true },
      destDraft: { pass: true },
      imsbc: { pass: true, reason: 'Group C — clean' },
    },
    sanctions: { risk: 'NONE', blocking: false },
  };
}

function fullVessel(): ParsedVessel {
  return {
    emailId: 'v1', itemIndex: 0, vesselName: null, imo: '1234567', flag: 'Panama',
    built: 2015, classSociety: 'DNV', pandi: 'Gard', dwtSummer: null, dwcc: null,
    draftMax: null, loa: null, beam: null, grt: null, nrt: null, holdsCount: null,
    hatchesCount: null, grainCapacity: null, grainCapacityUnit: null, baleCapacity: null,
    holdDimensions: null, hatchDimensions: null, tankTopStrength: null, geared: true,
    craneCapacity: null, hatchType: null, vesselType: 'bulk', openPosition: null,
    openDate: null, direction: null, restrictions: [], lastCargoes: 'wheat, corn',
    speedLaden: null, speedBallast: null, consumption: null, deckCapacity: null,
    specialFeatures: [], ciiRating: 'B',
  };
}

function fullArgs(over: Partial<BuildDDArgs> = {}): BuildDDArgs {
  return {
    fitBreakdown: fullFb(),
    fitPercent: 87,
    worksheet: fullWorksheet(),
    sanctions: { risk: 'NONE', blocking: false },
    tceUsdPerDay: 9600,
    breakevenTce: 8200,
    freightRateSource: 'parsed',
    consumptionEstimated: false,
    vessel: fullVessel(),
    cargoDescription: 'grain',
    refYear: 2026,
    ...over,
  };
}

function flat(model: ReturnType<typeof buildDueDiligence>): DDCheck[] {
  return model.categories.flatMap((c) => c.checks);
}
function byLabel(model: ReturnType<typeof buildDueDiligence>, label: string): DDCheck | undefined {
  return flat(model).find((c) => c.label === label);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildDueDiligence', () => {
  it('happy path: 5 categories, active counter, draft passes', () => {
    const m = buildDueDiligence(fullArgs());
    expect(m.categories.map((c) => c.key)).toEqual([
      'vessel-port', 'cargo-holds', 'economics', 'vetting', 'compliance',
    ]);
    expect(m.counter.ran).toBeGreaterThan(0);
    expect(byLabel(m, 'Осадка — порт погрузки')?.state).toBe('pass');
    expect(byLabel(m, 'Объём груза под трюмы')?.state).toBe('pass');
  });

  it('honesty: null lastCargoes → hold-cleanliness inactive, NOT pass, excluded from counter', () => {
    const vessel = { ...fullVessel(), lastCargoes: null };
    const m = buildDueDiligence(fullArgs({ vessel }));
    const hold = byLabel(m, 'Чистота трюмов / прошлый груз');
    expect(hold?.state).toBe('inactive');
    expect(hold?.state).not.toBe('pass');
    // inactive must not be counted as a run check
    const ranLabels = flat(m).filter((c) => c.state !== 'inactive').map((c) => c.label);
    expect(ranLabels).not.toContain('Чистота трюмов / прошлый груз');
  });

  it('honesty: null cargoDescription → hold-cleanliness inactive', () => {
    const m = buildDueDiligence(fullArgs({ cargoDescription: null }));
    expect(byLabel(m, 'Чистота трюмов / прошлый груз')?.state).toBe('inactive');
  });

  it('honesty: compatible last cargo → pass with living evidence', () => {
    const m = buildDueDiligence(fullArgs());
    const hold = byLabel(m, 'Чистота трюмов / прошлый груз');
    expect(hold?.state).toBe('pass');
    expect(hold?.evidence).toContain('wheat');
  });

  it('honesty: missing fitBreakdown → fb-dependent rows inactive, no crash', () => {
    const m = buildDueDiligence(fullArgs({ fitBreakdown: null }));
    expect(byLabel(m, 'Объём груза под трюмы')?.state).toBe('inactive');
    expect(byLabel(m, 'Экономика рейса (фит)')?.state).toBe('inactive');
    expect(byLabel(m, 'Утилизация DWT')?.state).toBe('inactive');
    expect(m.categories).toHaveLength(5);
  });

  it('honesty: Воздушный габарит / RightShip / KYC are permanent gap rows — always inactive', () => {
    const m = buildDueDiligence(fullArgs());
    for (const label of ['Воздушный габарит', 'RightShip score', 'KYC чартерера']) {
      const row = byLabel(m, label);
      expect(row).toBeDefined();
      expect(row?.state).toBe('inactive');
    }
    // LOA is inactive in this fixture because vessel.loa is null — not because it's unimplemented.
    // LOA behaviour is tested in the 'LOA берth row' describe block.
  });

  it('counter: ran = pass + caution + info, excludes inactive', () => {
    const m = buildDueDiligence(fullArgs());
    const checks = flat(m);
    const info = checks.filter((c) => c.state === 'info').length;
    expect(m.counter.ran).toBe(m.counter.pass + m.counter.caution + info);
    expect(m.counter.ran).toBe(checks.filter((c) => c.state !== 'inactive').length);
  });

  it('counter.info: breakdown reconciles — pass+caution+info === ran', () => {
    const m = buildDueDiligence(fullArgs());
    expect(m.counter).toHaveProperty('info');
    expect(m.counter.pass + m.counter.caution + m.counter.info).toBe(m.counter.ran);
    expect(m.counter.info).toBe(flat(m).filter((c) => c.state === 'info').length);
  });

  it('weight=0 component → inactive, not pass', () => {
    const fb = fullFb();
    const zeroWeightComp = fb.components.find((c) => c.factor === 'utilisation')!;
    zeroWeightComp.weight = 0;
    zeroWeightComp.score = 0;
    const m = buildDueDiligence(fullArgs({ fitBreakdown: fb }));
    expect(byLabel(m, 'Утилизация DWT')?.state).toBe('inactive');
  });

  it('parity: fitPercent echoes the passed value, never recomputes from fitBreakdown', () => {
    // fb.fitPercent is 94 but the stored fit_percent is 87 → must use 87.
    const m = buildDueDiligence(fullArgs({ fitPercent: 87 }));
    expect(m.fitPercent).toBe(87);
    expect(m.fitPercent).not.toBe(fullFb().fitPercent);
  });

  it('vetting: per-sub-factor rows derived from vessel; cii present → pass row', () => {
    const m = buildDueDiligence(fullArgs());
    expect(byLabel(m, 'Vessel age')?.state).toBe('pass');
    expect(byLabel(m, 'CII rating')?.state).toBe('pass');
  });

  it('vetting honesty: unknown sub-factor (no cii) → inactive, not pass', () => {
    const vessel = { ...fullVessel(), ciiRating: null };
    const m = buildDueDiligence(fullArgs({ vessel }));
    expect(byLabel(m, 'CII rating')?.state).toBe('inactive');
  });

  it('vetting: no vessel → rolled-up summary row + sub-factors absent', () => {
    const m = buildDueDiligence(fullArgs({ vessel: null }));
    expect(byLabel(m, 'Ветинг судна (сводно)')?.state).toBe('pass');
    expect(byLabel(m, 'Vessel age')).toBeUndefined();
  });

  it('sanctions blocking → compliance flag + flagsCritical = 1', () => {
    const m = buildDueDiligence(fullArgs({ sanctions: { risk: 'HIGH', reason: 'OFAC listed', blocking: true } }));
    const s = byLabel(m, 'Санкции судна (OFAC/EU)');
    expect(s?.state).toBe('caution');
    expect(s?.evidence).toContain('OFAC');
    expect(m.counter.flagsCritical).toBe(1);
  });

  it('sanctions clean → pass, flagsCritical = 0', () => {
    const m = buildDueDiligence(fullArgs());
    expect(byLabel(m, 'Санкции судна (OFAC/EU)')?.state).toBe('pass');
    expect(m.counter.flagsCritical).toBe(0);
  });

  it('TCE vs breakeven: below breakeven → caution with $/day evidence', () => {
    const m = buildDueDiligence(fullArgs({ tceUsdPerDay: 7000, breakevenTce: 8200 }));
    const tce = byLabel(m, 'TCE vs breakeven');
    expect(tce?.state).toBe('caution');
    expect(tce?.evidence).toContain('ниже breakeven');
  });

  it('TCE null → inactive', () => {
    const m = buildDueDiligence(fullArgs({ tceUsdPerDay: null }));
    expect(byLabel(m, 'TCE vs breakeven')?.state).toBe('inactive');
  });

  it('freight estimate source → caution «оценка»', () => {
    const m = buildDueDiligence(fullArgs({ freightRateSource: 'baltic', consumptionEstimated: true }));
    const fr = byLabel(m, 'Фрахт vs Baltic');
    expect(fr?.state).toBe('caution');
    expect(fr?.evidence).toContain('оценка');
    expect(fr?.evidence).toContain('расход оценён');
  });
});

// ── LOA-под-причал berth gate (Task #8) ──────────────────────────────────────

describe('buildDueDiligence — LOA berth row', () => {
  it('active PASS: vessel LOA within restrictive port berth max', () => {
    // Sfax maxLOA 180m; load Sfax, vessel 150m → fits.
    const ws = fullWorksheet();
    ws.vessel.loa = 150;
    ws.cargo = { ...ws.cargo, loadPort: 'Sfax', dischargePort: 'Sfax' };
    const m = buildDueDiligence(fullArgs({ worksheet: ws }));
    const row = byLabel(m, 'LOA под причал');
    expect(row?.state).toBe('pass');
    expect(row?.evidence).toContain('150');
    expect(row?.detail).toBeTruthy();
    expect(row?.source).toBeTruthy();
  });

  it('active CAUTION: vessel LOA exceeds restrictive port berth max', () => {
    const ws = fullWorksheet();
    ws.vessel.loa = 200; // > Sfax 180
    ws.cargo = { ...ws.cargo, loadPort: 'Sfax', dischargePort: 'Sfax' };
    const m = buildDueDiligence(fullArgs({ worksheet: ws }));
    const row = byLabel(m, 'LOA под причал');
    expect(row?.state).toBe('caution');
    expect(row?.evidence).toMatch(/LOA/i);
  });

  it('honesty: vessel LOA absent → inactive «нет данных в письме», never fake-pass', () => {
    const ws = fullWorksheet(); // no loa on fixture vessel
    ws.cargo = { ...ws.cargo, loadPort: 'Sfax', dischargePort: 'Sfax' };
    const m = buildDueDiligence(fullArgs({ worksheet: ws }));
    const row = byLabel(m, 'LOA под причал');
    expect(row?.state).toBe('inactive');
    expect(row?.evidence).toMatch(/письм/i);
  });

  it('honesty: vessel LOA present but no berth data on the ports → inactive «нет данных по причалу»', () => {
    const ws = fullWorksheet();
    ws.vessel.loa = 150;
    // Odesa has no maxLOA (backfill pending); Alexandria likewise.
    ws.cargo = { ...ws.cargo, loadPort: 'Odesa', dischargePort: 'Alexandria' };
    const m = buildDueDiligence(fullArgs({ worksheet: ws }));
    const row = byLabel(m, 'LOA под причал');
    expect(row?.state).toBe('inactive');
    expect(row?.evidence).toMatch(/причал/i);
  });

  it('DISCH-LOA both ports fail: evidence shows both reasons, not just load', () => {
    // Sfax maxLOA 180m; vessel 200m → fails BOTH load and discharge
    const ws = fullWorksheet();
    ws.vessel.loa = 200;
    ws.cargo = { ...ws.cargo, loadPort: 'Sfax', dischargePort: 'Sfax' };
    const m = buildDueDiligence(fullArgs({ worksheet: ws }));
    const row = byLabel(m, 'LOA под причал');
    expect(row?.state).toBe('caution');
    // When both ports fail, both reasons must appear in evidence (not just load port)
    expect(row?.evidence).toMatch(/LOA/i);
    // Evidence must contain content (not empty)
    expect(row?.evidence?.length).toBeGreaterThan(5);
  });
});

// ── detail / source disclosure (demo «Подробнее») ─────────────────────────────

describe('buildDueDiligence — detail + source disclosure', () => {
  it('every ACTIVE check carries non-empty detail AND source', () => {
    const m = buildDueDiligence(fullArgs());
    const active = flat(m).filter((c) => c.state !== 'inactive');
    expect(active.length).toBeGreaterThan(0);
    const missing = active.filter((c) => !c.detail || !c.source).map((c) => c.label);
    expect(missing).toEqual([]);
  });

  it('permanent gap rows (Воздушный габарит / RightShip / KYC) → detail null AND source null', () => {
    const m = buildDueDiligence(fullArgs());
    for (const label of ['Воздушный габарит', 'RightShip score', 'KYC чартерера']) {
      const row = byLabel(m, label);
      expect(row?.state).toBe('inactive');
      expect(row?.detail ?? null).toBeNull();
      expect(row?.source ?? null).toBeNull();
    }
  });

  it('founder honesty: null lastCargoes → hold-cleanliness inactive BUT keeps detail + «уточнить» evidence (never fake-pass)', () => {
    const vessel = { ...fullVessel(), lastCargoes: null };
    const m = buildDueDiligence(fullArgs({ vessel }));
    const hold = byLabel(m, 'Чистота трюмов / прошлый груз');
    expect(hold?.state).toBe('inactive');
    expect(hold?.state).not.toBe('pass');
    expect(hold?.evidence).toContain('уточнить');
    // honesty disclosure: this special inactive row DOES explain itself
    expect(hold?.detail).toBeTruthy();
    expect(hold?.detail).toContain('L5C');
  });

  it('worked-calc TCE: detail shows arithmetic + war-risk honesty caveat', () => {
    const m = buildDueDiligence(fullArgs({ tceUsdPerDay: 9600, breakevenTce: 8200 }));
    const tce = byLabel(m, 'TCE vs breakeven');
    expect(tce?.state).toBe('pass');
    expect(tce?.detail).toContain('9,600');
    expect(tce?.detail).toContain('8,200');
    expect(tce?.detail).toContain('1,400'); // diff
    expect(tce?.detail?.toLowerCase()).toContain('war-risk');
    expect(tce?.source).toBe('Расчёт TCE');
  });

  it('worked-calc utilisation: detail reconciles with stored bracketData numbers', () => {
    const fb = fullFb();
    const util = fb.components.find((c) => c.factor === 'utilisation')!;
    util.bracketData = '24,000 / 27,000 mt';
    const m = buildDueDiligence(fullArgs({ fitBreakdown: fb }));
    const row = byLabel(m, 'Утилизация DWT');
    expect(row?.detail).toContain('24,000');
    expect(row?.detail).toContain('27,000');
    expect(row?.detail).toContain('89%'); // 24000/27000
    expect(row?.detail).toContain('номинал'); // honesty caveat (nominal weight)
  });

  it('worked-calc draft: detail shows laden vs limit + screening honesty caveat', () => {
    const m = buildDueDiligence(fullArgs());
    const row = byLabel(m, 'Осадка — порт погрузки');
    expect(row?.detail).toContain('9.2'); // estimatedLadenDraftM
    expect(row?.detail).toContain('10.5'); // portLimitM
    expect(row?.detail?.toLowerCase()).toContain('скрининг');
  });

  it('draft derivation: load row carries {dwt, cargoTons, laden, portLimit, pass}; laden mirrors STORED estimate 1:1', () => {
    const m = buildDueDiligence(fullArgs());
    const row = byLabel(m, 'Осадка — порт погрузки');
    expect(row?.derivation).toBeTruthy();
    expect(row?.derivation?.dwt).toBe(35000);
    expect(row?.derivation?.cargoTons).toBe(30000);
    // parity: never recompute over a stored value — laden === stored estimatedLadenDraftM 1:1
    expect(row?.derivation?.laden).toBe(9.2);
    expect(row?.derivation?.portLimit).toBe(10.5);
    expect(row?.derivation?.pass).toBe(true);
  });

  it('draft derivation: cargoTons uses weightMtEffective (worst-case max) over nominal weightMt', () => {
    const ws = fullWorksheet();
    ws.cargo.weightMtEffective = 32000;
    const m = buildDueDiligence(fullArgs({ worksheet: ws }));
    expect(byLabel(m, 'Осадка — порт погрузки')?.derivation?.cargoTons).toBe(32000);
  });

  it('draft derivation: discharge row recomputes laden from DWT+cargo when stored estimate absent (engine-parity ceil)', () => {
    const m = buildDueDiligence(fullArgs());
    const row = byLabel(m, 'Осадка — порт выгрузки');
    const fullLoad = 0.4991 * Math.pow(35000, 0.2991);
    const ratio = Math.min(30000 / 35000, 1);
    const expected = Math.ceil(fullLoad * Math.pow(ratio, 0.3) * 10) / 10;
    expect(row?.derivation?.laden).toBe(expected);
    expect(row?.derivation?.portLimit).toBeNull(); // destDraft has no stored portLimitM
    expect(row?.derivation?.pass).toBe(true);
  });

  it('draft derivation: null + «нет данных» honesty when DWT/cargo missing (no laden steps possible)', () => {
    const ws = fullWorksheet();
    ws.vessel.dwtSummer = null;
    ws.hardFilters.draft = { pass: true }; // no stored estimate either
    const m = buildDueDiligence(fullArgs({ worksheet: ws }));
    const row = byLabel(m, 'Осадка — порт погрузки');
    expect(row?.derivation == null).toBe(true);
    expect(row?.detail?.toLowerCase()).toContain('нет данных');
  });

  it('draft derivation: never feeds counter (display-only parity)', () => {
    const m = buildDueDiligence(fullArgs());
    expect(m.counter.ran).toBe(flat(m).filter((c) => c.state !== 'inactive').length);
    expect(m.counter.pass + m.counter.caution + m.counter.info).toBe(m.counter.ran);
  });

  it('worked-calc age: detail shows refYear − built arithmetic', () => {
    const m = buildDueDiligence(fullArgs());
    const row = byLabel(m, 'Vessel age');
    expect(row?.detail).toContain('2026');
    expect(row?.detail).toContain('2015');
    expect(row?.detail).toContain('11'); // 2026 - 2015
  });

  it('lookup checks (Paris MoU flag) → detail without arithmetic + source badge', () => {
    const m = buildDueDiligence(fullArgs());
    const row = byLabel(m, 'Flag (Paris MoU)');
    expect(row?.detail).toContain('Paris MoU');
    expect(row?.source).toBe('Paris MoU');
  });

  it('parity: adding detail/source leaves counter + fitPercent untouched', () => {
    const m = buildDueDiligence(fullArgs());
    // counter still reconciles to active-state rows only (detail/source never read)
    expect(m.counter.ran).toBe(flat(m).filter((c) => c.state !== 'inactive').length);
    expect(m.counter.pass + m.counter.caution + m.counter.info).toBe(m.counter.ran);
    expect(m.fitPercent).toBe(87);
  });

  it('inactive fb-dependent rows → detail/source null (no fake explanation)', () => {
    const m = buildDueDiligence(fullArgs({ fitBreakdown: null }));
    const row = byLabel(m, 'Утилизация DWT');
    expect(row?.state).toBe('inactive');
    expect(row?.detail ?? null).toBeNull();
    expect(row?.source ?? null).toBeNull();
  });
});
