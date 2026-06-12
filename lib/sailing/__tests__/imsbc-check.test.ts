import { checkImsbcLoadability } from '../imsbc-check';

describe('checkImsbcLoadability — Group C (safe)', () => {
  it('wheat → Group C, ok, no requirements', () => {
    const r = checkImsbcLoadability('wheat');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
    expect(r.requirements).toHaveLength(0);
  });

  it('steel slabs → Group C via steel alias', () => {
    const r = checkImsbcLoadability('steel slabs');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('HRC (Hot Rolled Coils) → Group C via alias', () => {
    const r = checkImsbcLoadability('HRC');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('cement → Group C', () => {
    const r = checkImsbcLoadability('cement');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('clinker → Group C', () => {
    const r = checkImsbcLoadability('Bulk clinker');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('soya in bulk → Group C (alias → soybean)', () => {
    const r = checkImsbcLoadability('Soya in bulk');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('urea → Group C (not generic fertilizer)', () => {
    const r = checkImsbcLoadability('urea');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('potash → Group C', () => {
    const r = checkImsbcLoadability('muriate of potash');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('alumina → Group C (processed bauxite)', () => {
    const r = checkImsbcLoadability('Alumina in bulk');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('scrap → Group C (HMS)', () => {
    const r = checkImsbcLoadability('soft stainless scrap');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('salt → Group C', () => {
    const r = checkImsbcLoadability('Salt in big bags');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });

  it('sugar → Group C', () => {
    const r = checkImsbcLoadability('Bulk sugar');
    expect(r.group).toBe('C');
    expect(r.verdict).toBe('ok');
  });
});

describe('checkImsbcLoadability — Group A (liquefaction risk)', () => {
  it('iron ore → Group A, caution, TML cert required', () => {
    const r = checkImsbcLoadability('iron ore');
    expect(r.group).toBe('A');
    expect(r.verdict).toBe('caution');
    expect(r.requirements.some((req) => /TML/i.test(req))).toBe(true);
    expect(r.rationale).toMatch(/liquefaction/i);
  });

  it('bauxite → Group A', () => {
    const r = checkImsbcLoadability('Bauxite, quantity flexible');
    expect(r.group).toBe('A');
    expect(r.verdict).toBe('caution');
  });

  it('nickel ore → Group A (high liquefaction risk)', () => {
    const r = checkImsbcLoadability('nickel ore');
    expect(r.group).toBe('A');
    expect(r.verdict).toBe('caution');
    expect(r.requirements.some((req) => /TML/i.test(req))).toBe(true);
  });

  it('manganese ore → Group A', () => {
    const r = checkImsbcLoadability('Bulk manganese ore');
    expect(r.group).toBe('A');
    expect(r.verdict).toBe('caution');
  });

  it('rock phosphate → Group A', () => {
    const r = checkImsbcLoadability('Rock phosphate in bulk');
    expect(r.group).toBe('A');
    expect(r.verdict).toBe('caution');
  });

  it('copper concentrate → Group B (dual A+B: B is dominant hazard)', () => {
    const r = checkImsbcLoadability('copper concentrate');
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
    // Requirements should mention both TML and H2S
    expect(r.requirements.some((req) => /TML/i.test(req))).toBe(true);
    expect(r.requirements.some((req) => /H2S/i.test(req))).toBe(true);
  });
});

describe('checkImsbcLoadability — Group B (chemical hazard)', () => {
  it('coal → Group B, caution, gas monitoring required', () => {
    const r = checkImsbcLoadability('coal in bulk');
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
    expect(r.imoClass).toBe('4.2');
    expect(r.requirements.some((req) => /methane|gas/i.test(req))).toBe(true);
  });

  it('anthracite → Group B, caution', () => {
    const r = checkImsbcLoadability('Anthracite, stowage factor 43');
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
    expect(r.imoClass).toBe('4.2');
  });

  it('metcoke → Group B via alias', () => {
    const r = checkImsbcLoadability('Metcoke in bulk');
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
  });

  it('DRI → Group B, caution, dedicated voyage note', () => {
    const r = checkImsbcLoadability('dri');
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
    expect(r.imoClass).toBe('4.2');
    expect(r.requirements.some((req) => /dedicated|moisture|water/i.test(req))).toBe(true);
  });

  it('sulphur → Group B class 4.1', () => {
    const r = checkImsbcLoadability('sulphur');
    expect(r.group).toBe('B');
    expect(r.imoClass).toBe('4.1');
  });

  it('fertilizers (generic) → Group B conservative', () => {
    const r = checkImsbcLoadability('Fertilizers');
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
  });

  it('rapeseed meal → Group B, self-heating risk', () => {
    const r = checkImsbcLoadability('Rapeseed meal pellets in bulk');
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
  });

  it('olive pomace → Group B, self-heating', () => {
    const r = checkImsbcLoadability('Olive pomace, stowage factor 58');
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
  });

  it('coal tar pitch → Group B', () => {
    const r = checkImsbcLoadability('Coal tar pitch in big bags');
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
  });
});

describe('checkImsbcLoadability — incompatible (Group B + vessel DG restriction)', () => {
  it('coal + vessel "no dangerous goods" → incompatible', () => {
    const r = checkImsbcLoadability('coal', { restrictions: ['no dangerous goods'] });
    expect(r.verdict).toBe('incompatible');
    expect(r.rationale).toMatch(/vessel restrictions/i);
  });

  it('DRI + vessel "no self-heating cargo" → incompatible', () => {
    const r = checkImsbcLoadability('dri', { restrictions: ['no self-heating cargo'] });
    expect(r.verdict).toBe('incompatible');
  });

  it('Group A cargo (iron ore) + DG restriction → still caution (A not blocked by DG restriction)', () => {
    const r = checkImsbcLoadability('iron ore', { restrictions: ['no dangerous goods'] });
    expect(r.verdict).toBe('caution');
    expect(r.group).toBe('A');
  });

  it('Group C cargo (wheat) + DG restriction → ok (group C never blocked)', () => {
    const r = checkImsbcLoadability('wheat', { restrictions: ['no dangerous goods'] });
    expect(r.verdict).toBe('ok');
  });

  it('Group B cargo + unrelated restriction → caution (not blocked)', () => {
    const r = checkImsbcLoadability('coal', { restrictions: ['no refrigerated cargo', 'min DWT 25000'] });
    expect(r.verdict).toBe('caution');
  });

  it('Group B cargo + vessel no restrictions → caution', () => {
    const r = checkImsbcLoadability('coal', { restrictions: [] });
    expect(r.verdict).toBe('caution');
  });
});

describe('checkImsbcLoadability — unknown cargo (neutral)', () => {
  it('null cargo → ok (neutral)', () => {
    const r = checkImsbcLoadability(null);
    expect(r.group).toBe('unknown');
    expect(r.verdict).toBe('ok');
    expect(r.requirements).toHaveLength(0);
  });

  it('empty string → ok (neutral)', () => {
    const r = checkImsbcLoadability('');
    expect(r.group).toBe('unknown');
    expect(r.verdict).toBe('ok');
  });

  it('"mobile machinery" → ok (not in IMSBC table — neutral)', () => {
    const r = checkImsbcLoadability('Mobile machinery, 10 units, part cargo');
    expect(r.group).toBe('unknown');
    expect(r.verdict).toBe('ok');
  });

  it('"bulk cargo, commodity not specified" → ok (neutral)', () => {
    const r = checkImsbcLoadability('Bulk cargo, commodity not specified');
    expect(r.group).toBe('unknown');
    expect(r.verdict).toBe('ok');
  });

  it('unknown + vessel DG restriction → still ok (not in table → no restriction)', () => {
    const r = checkImsbcLoadability('exotic widget pellets', { restrictions: ['no dangerous goods'] });
    expect(r.group).toBe('unknown');
    expect(r.verdict).toBe('ok');
  });
});

describe('Group A vs liquefaction-restricted vessel (audit C.3)', () => {
  // Group A cargo confirmed from imsbc-groups.json ("nickel ore": group A).
  const GROUP_A_CARGO = 'nickel ore';

  it.each([
    ['no concentrates'],
    ['No liquefiable cargoes'],
    ['NO GROUP A CARGOES'],
    ['no nickel ore'],
    ['no TML cargoes'],
  ])('restriction "%s" → incompatible', (restriction) => {
    const r = checkImsbcLoadability(GROUP_A_CARGO, { restrictions: [restriction] });
    expect(r.group).toBe('A');
    expect(r.verdict).toBe('incompatible');
  });

  it('Group A without matching restriction stays caution (TML cert required)', () => {
    const r = checkImsbcLoadability(GROUP_A_CARGO, { restrictions: ['no DG'] });
    expect(r.verdict).toBe('caution');
  });

  it('Group C cargo unaffected by liquefaction restrictions', () => {
    // 'grain' is not an IMSBC key — 'wheat' is the confirmed Group C entry.
    const r = checkImsbcLoadability('wheat', { restrictions: ['no concentrates'] });
    expect(r.verdict).toBe('ok');
  });
});

describe('dual-hazard Group B concentrates vs liquefaction-restricted vessel (audit C.3)', () => {
  // imsbc-groups.json: 'copper concentrate' is the dual-hazard entry — Group B
  // (IMDG 4.2) but liquefaction-prone like Group A. 'zinc concentrate' and
  // 'lead concentrate' are Group A in the table (Group A branch covers them).
  it.each([
    ['copper concentrate', 'no concentrates'],
    ['copper conc', 'No liquefiable cargoes'],
    ['cu concentrate', 'no TML cargoes'],
  ])('%s blocked by "%s"', (cargo, restriction) => {
    const r = checkImsbcLoadability(cargo, { restrictions: [restriction] });
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('incompatible');
  });

  it.each([
    ['zinc conc', 'No liquefiable cargoes'],
    ['lead concentrate', 'no TML cargoes'],
  ])('%s (Group A in table) blocked by "%s" via Group A branch', (cargo, restriction) => {
    const r = checkImsbcLoadability(cargo, { restrictions: [restriction] });
    expect(r.group).toBe('A');
    expect(r.verdict).toBe('incompatible');
  });

  it('copper concentrate without liquefaction restriction keeps Group B caution', () => {
    const r = checkImsbcLoadability('copper concentrate', { restrictions: [] });
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('caution');
  });

  it('copper concentrate still blocked by DG restriction (existing path intact)', () => {
    const r = checkImsbcLoadability('copper concentrate', { restrictions: ['no dangerous goods'] });
    expect(r.group).toBe('B');
    expect(r.verdict).toBe('incompatible');
  });

  it.each([['sulphur'], ['ammonium nitrate']])(
    'non-concentrate Group B cargo %s ignores liquefaction restrictions',
    (cargo) => {
      const r = checkImsbcLoadability(cargo, { restrictions: ['no concentrates'] });
      expect(r.group).toBe('B');
      expect(r.verdict).toBe('caution');
    },
  );
});
