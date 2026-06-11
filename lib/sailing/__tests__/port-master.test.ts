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

describe('port-master gap-fill: Bug E1 — 4 missing ports', () => {
  // Izmail — Ukrainian Danube port, grain/steel, shore cranes, shallow draft
  it('Izmail: entry exists in port-master', () => {
    expect(getPortMaster('Izmail')).not.toBeNull();
  });

  it('Izmail: hasShoreCranes === true', () => {
    expect(getPortMaster('Izmail')!.hasShoreCranes).toBe(true);
  });

  it('Izmail: maxDraftM ≤ 8 (Danube river port)', () => {
    const m = getPortMaster('Izmail');
    expect(m!.maxDraftM).toBeGreaterThan(0);
    expect(m!.maxDraftM).toBeLessThanOrEqual(8);
  });

  it('Izmail: lat/lon set (UA Danube, ~45.35N 28.84E)', () => {
    const m = getPortMaster('Izmail');
    expect(m!.lat).toBeCloseTo(45.35, 0);
    expect(m!.lon).toBeCloseTo(28.84, 0);
  });

  // Reni — aliases to Izmail in port-distances, same port-master entry
  it('Reni alias resolves to Izmail entry', () => {
    const reni = getPortMaster('Reni');
    const izmail = getPortMaster('Izmail');
    expect(reni).not.toBeNull();
    expect(reni).toEqual(izmail);
  });

  // Derince — Turkish Marmara port. Currently aliases to Marmara in
  // port-distances; after this fix Derince gets its own canonical entry
  // and the alias is updated to point to it.
  it('Derince: entry exists in port-master', () => {
    expect(getPortMaster('Derince')).not.toBeNull();
  });

  it('Derince: hasShoreCranes === true', () => {
    expect(getPortMaster('Derince')!.hasShoreCranes).toBe(true);
  });

  it('Derince: maxDraftM ≥ 10 (deep Marmara port)', () => {
    expect(getPortMaster('Derince')!.maxDraftM).toBeGreaterThanOrEqual(10);
  });

  it('Derince: lat/lon set (TR Marmara, ~40.75N 29.81E)', () => {
    const m = getPortMaster('Derince');
    expect(m!.lat).toBeCloseTo(40.75, 0);
    expect(m!.lon).toBeCloseTo(29.81, 0);
  });

  // Antalya — Turkish Mediterranean port, shore cranes, deep-sea
  it('Antalya: entry exists in port-master', () => {
    expect(getPortMaster('Antalya')).not.toBeNull();
  });

  it('Antalya: hasShoreCranes === true', () => {
    expect(getPortMaster('Antalya')!.hasShoreCranes).toBe(true);
  });

  it('Antalya: maxDraftM ≥ 10', () => {
    expect(getPortMaster('Antalya')!.maxDraftM).toBeGreaterThanOrEqual(10);
  });

  it('Antalya: lat/lon set (TR Med, ~36.85N 30.61E)', () => {
    const m = getPortMaster('Antalya');
    expect(m!.lat).toBeCloseTo(36.85, 0);
    expect(m!.lon).toBeCloseTo(30.61, 0);
  });

  // Sanity distance check via haversine: Izmail ↔ Constanta ≈ 130 NM (matrix)
  // and Izmail ↔ Chornomorsk should be < 200 km haversine
  it('getPortMaster("izmail") works case-insensitive', () => {
    expect(getPortMaster('izmail')).toEqual(getPortMaster('Izmail'));
  });

  it('getPortMaster("ANTALYA") works uppercase', () => {
    expect(getPortMaster('ANTALYA')).toEqual(getPortMaster('Antalya'));
  });
});

describe('port-master Phase F1 — Savona + Figueira da Foz draft corrections', () => {
  // PI3: expectation updated — Savona actual berth max is 14.5m (Alti Fondali), not 15m
  it('Savona (ITSVN) maxDraftM is 14.5 (Alti Fondali berths, verified MagicPort/SeaRates)', () => {
    const m = getPortMaster('Savona');
    expect(m).not.toBeNull();
    expect(m!.maxDraftM).toBe(14.5);
  });

  // PI3: expectation updated — "Savona-Vado" alias removed (it refers to ITVDL, not ITSVN)
  it('"Savona-Vado" alias is NOT present in ITSVN (belongs to separate UNLOCODE ITVDL)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ports = require('@/data/ports/port-master.json') as Array<{ unlocode: string; aliases?: string[] }>;
    const savona = ports.find((p) => p.unlocode === 'ITSVN');
    expect(savona?.aliases).not.toContain('Savona-Vado');
  });

  it('Figueira da Foz (PTFDF) maxDraftM is 5.5 (conservative cargo berth depth)', () => {
    const m = getPortMaster('Figueira da Foz');
    expect(m).not.toBeNull();
    expect(m!.maxDraftM).toBe(5.5);
  });

  it('Figueira da Foz is tidal', () => {
    expect(getPortMaster('Figueira da Foz')!.tidal).toBe(true);
  });
});

describe('port-master Phase G1 — Vado Ligure ITVDL (new entry)', () => {
  it('Vado Ligure entry exists in port-master', () => {
    expect(getPortMaster('Vado Ligure')).not.toBeNull();
  });

  it('Vado Ligure resolves by alias "Vado"', () => {
    expect(getPortMaster('Vado')).not.toBeNull();
    expect(getPortMaster('Vado')!.unlocode).toBe('ITVDL');
  });

  it('Vado Ligure resolves by alias "Savona-Vado"', () => {
    expect(getPortMaster('Savona-Vado')).not.toBeNull();
    expect(getPortMaster('Savona-Vado')!.unlocode).toBe('ITVDL');
  });

  it('Vado Ligure (ITVDL) maxDraftM is 17.25 (SECH terminal berth depth)', () => {
    const m = getPortMaster('Vado Ligure');
    expect(m!.maxDraftM).toBe(17.25);
  });

  it('Vado Ligure portCanHandleDraft: 17m vessel passes', () => {
    const r = portCanHandleDraft('Vado Ligure', 17.0);
    expect(r.ok).toBe(true);
  });

  it('Vado Ligure portCanHandleDraft: 17.5m vessel blocked (exceeds 17.25m)', () => {
    const r = portCanHandleDraft('Vado Ligure', 17.5);
    expect(r.ok).toBe(false);
  });

  it('Savona (ITSVN) portCanHandleDraft: 14.5m vessel passes', () => {
    const r = portCanHandleDraft('Savona', 14.5);
    expect(r.ok).toBe(true);
  });

  it('Savona (ITSVN) portCanHandleDraft: 15.1m vessel blocked (exceeds 14.5m)', () => {
    const r = portCanHandleDraft('Savona', 15.1);
    expect(r.ok).toBe(false);
  });
});

describe('port-master TRNEM alias — Nemrut Limani Bay → TRALI (Aliaga)', () => {
  it('TRNEM UNLOCODE alias resolves to Aliaga entry', () => {
    const m = getPortMaster('TRNEM');
    expect(m).not.toBeNull();
    expect(m!.unlocode).toBe('TRALI');
  });

  it('TRNEM and Aliaga resolve to same entry', () => {
    expect(getPortMaster('TRNEM')).toEqual(getPortMaster('Aliaga'));
  });

  it('TRNEM entry has correct maxDraftM (14 m)', () => {
    const m = getPortMaster('TRNEM');
    expect(m!.maxDraftM).toBe(14);
  });
});
