import type { PortMaster } from '../port-master';

describe('PortMaster type — extended fields', () => {
  it('accepts UN/LOCODE + coordinates + enrichment fields', () => {
    const rotterdam: PortMaster = {
      unlocode: 'NLRTM',
      name: 'Rotterdam',
      country: 'NL',
      lat: 51.95,
      lon: 4.14,
      maxDraftM: 24.0,
      hasShoreCranes: true,
      berthType: 'deep-sea',
      maxLOA: 400,
      cargoBerthTypes: ['container', 'bulk', 'general', 'RORO', 'tanker'],
      tidal: true,
      icePort: false,
      dataConfidence: 'high',
      sourceNote: 'Port of Rotterdam Authority',
    };
    expect(rotterdam.unlocode).toBe('NLRTM');
    expect(rotterdam.cargoBerthTypes).toContain('bulk');
    expect(rotterdam.dataConfidence).toBe('high');
  });

  it('keeps legacy-minimal shape valid (for migrated 15 existing ports)', () => {
    const legacy: PortMaster = {
      unlocode: 'TRKRS',
      name: 'Karasu',
      country: 'TR',
      lat: 41.113,
      lon: 30.683,
      maxDraftM: 11,
      hasShoreCranes: true,
      berthType: 'deep-sea',
      note: 'Turkish Black Sea port, steel/grain',
    };
    expect(legacy.note).toBeDefined();
    expect(legacy.maxLOA).toBeUndefined();
    expect(legacy.cargoBerthTypes).toBeUndefined();
  });
});

describe('migrated 15 ports — UN/LOCODE + coordinates', () => {
  // Sanity: getPortMaster returns PortMaster with unlocode/lat/lon for each of the 15.
  const EXPECTED: Array<[string, string, number, number]> = [
    // [port name, UNLOCODE, lat rough, lon rough] — lat/lon tolerance ±0.3°
    ['Karasu', 'TRKRS', 41.1, 30.7],
    ['Istanbul', 'TRIST', 41.0, 28.9],
    ['Mykolaiv', 'UANLK', 46.95, 31.99],
    ['Odesa', 'UAODS', 46.48, 30.74],
    ['Constanta', 'ROCND', 44.18, 28.65],
    ['Varna', 'BGVAR', 43.2, 27.9],
    ['Burgas', 'BGBOJ', 42.5, 27.47],
    ['Novorossiysk', 'RUNVS', 44.72, 37.77],
    ['Piraeus', 'GRPIR', 37.94, 23.64],
    ['Aliaga', 'TRALI', 38.8, 26.97],
    ['Alexandria', 'EGALY', 31.2, 29.87],
    ['Ravenna', 'ITRAN', 44.48, 12.28],
    ['Skikda', 'DZSKI', 36.88, 6.9],
    ['Casablanca', 'MACAS', 33.6, -7.62],
    ['Bayonne', 'FRBAY', 43.52, -1.48],
  ];

  // Runtime import deferred via require to keep the type-only test at top pure.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getPortMaster } = require('../port-master');

  it.each(EXPECTED)('%s has UNLOCODE=%s and coordinates ≈(%s, %s)', (name, unlocode, lat, lon) => {
    const m = getPortMaster(name);
    expect(m).not.toBeNull();
    expect(m.unlocode).toBe(unlocode);
    expect(m.name).toBe(name);
    expect(m.country).toHaveLength(2);
    expect(m.lat).toBeCloseTo(lat as number, 0);
    expect(m.lon).toBeCloseTo(lon as number, 0);
  });
});
