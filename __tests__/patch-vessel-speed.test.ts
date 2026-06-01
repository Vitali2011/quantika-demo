import {
  defaultSpeedConsumption,
  extractDwt,
  asItems,
  patchVesselItem,
} from '../scripts/demo-seed/patch-vessel-speed-consumption';

// ── defaultSpeedConsumption ───────────────────────────────────────────────────

describe('defaultSpeedConsumption', () => {
  it('returns null for null dwt', () => {
    expect(defaultSpeedConsumption(null)).toBeNull();
  });

  it('returns null for zero dwt', () => {
    expect(defaultSpeedConsumption(0)).toBeNull();
  });

  it('returns null for negative dwt', () => {
    expect(defaultSpeedConsumption(-1000)).toBeNull();
  });

  it('small vessel <40k DWT → 12.5 kts / 22 mt/day', () => {
    expect(defaultSpeedConsumption(28_000)).toEqual({
      speedLaden: '12.5 kts',
      consumption: '22 mt/day',
    });
  });

  it('handymax 40k-64k DWT → 13 kts / 26 mt/day', () => {
    expect(defaultSpeedConsumption(56_000)).toEqual({
      speedLaden: '13 kts',
      consumption: '26 mt/day',
    });
  });

  it('panamax 65k-99k DWT → 13.5 kts / 30 mt/day', () => {
    expect(defaultSpeedConsumption(75_000)).toEqual({
      speedLaden: '13.5 kts',
      consumption: '30 mt/day',
    });
  });

  it('capesize >=100k DWT → 14.5 kts / 38 mt/day', () => {
    expect(defaultSpeedConsumption(180_000)).toEqual({
      speedLaden: '14.5 kts',
      consumption: '38 mt/day',
    });
  });

  it('boundary: exactly 40_000 → handymax tier', () => {
    expect(defaultSpeedConsumption(40_000)).toEqual({
      speedLaden: '13 kts',
      consumption: '26 mt/day',
    });
  });

  it('boundary: exactly 65_000 → panamax tier', () => {
    expect(defaultSpeedConsumption(65_000)).toEqual({
      speedLaden: '13.5 kts',
      consumption: '30 mt/day',
    });
  });

  it('boundary: exactly 100_000 → capesize tier', () => {
    expect(defaultSpeedConsumption(100_000)).toEqual({
      speedLaden: '14.5 kts',
      consumption: '38 mt/day',
    });
  });
});

// ── extractDwt ────────────────────────────────────────────────────────────────

describe('extractDwt', () => {
  it('extracts plain number', () => {
    expect(extractDwt(75_000)).toBe(75_000);
  });

  it('extracts ConfidenceField value', () => {
    expect(extractDwt({ value: 56_000, confidence: 'confirmed', sourceText: '56000' })).toBe(56_000);
  });

  it('returns null for null', () => {
    expect(extractDwt(null)).toBeNull();
  });

  it('returns null for zero', () => {
    expect(extractDwt(0)).toBeNull();
  });

  it('returns null for ConfidenceField with 0', () => {
    expect(extractDwt({ value: 0, confidence: 'estimated' })).toBeNull();
  });

  it('returns null for non-numeric ConfidenceField', () => {
    expect(extractDwt({ value: '75000', confidence: 'confirmed' })).toBeNull();
  });
});

// ── asItems ───────────────────────────────────────────────────────────────────

describe('asItems', () => {
  it('parses array result_json', () => {
    const items = asItems('[{"vesselName":"mv Test"},{"vesselName":"mv Two"}]');
    expect(items).toHaveLength(2);
    expect(items[0].vesselName).toBe('mv Test');
  });

  it('wraps single-object result_json in array', () => {
    const items = asItems('{"vesselName":"mv Legacy"}');
    expect(items).toHaveLength(1);
    expect(items[0].vesselName).toBe('mv Legacy');
  });
});

// ── patchVesselItem (core logic) ──────────────────────────────────────────────

describe('patchVesselItem', () => {
  it('patches vessel lacking both fields — adds build.ts #736 defaults', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV MARIA',
      dwtSummer: { value: 75_000, confidence: 'confirmed', sourceText: '75000' },
      openDate: '2026-06-10',
      speedLaden: null,
      consumption: null,
    };
    const modified = patchVesselItem(vessel);
    expect(modified).toBe(true);
    expect(vessel.speedLaden).toBe('13.5 kts');   // panamax tier
    expect(vessel.consumption).toBe('30 mt/day');
  });

  it('idempotent — vessel already having both fields is untouched', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV SOFIA',
      dwtSummer: { value: 75_000, confidence: 'confirmed', sourceText: '75000' },
      speedLaden: '14 kts',
      consumption: '32 mt/day',
    };
    const modified = patchVesselItem(vessel);
    expect(modified).toBe(false);
    expect(vessel.speedLaden).toBe('14 kts');     // original preserved
    expect(vessel.consumption).toBe('32 mt/day');
  });

  it('does not overwrite existing speedLaden when only consumption missing', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV ANNA',
      dwtSummer: { value: 56_000, confidence: 'confirmed' },
      speedLaden: '12 kts',   // already set (custom value)
      consumption: null,
    };
    patchVesselItem(vessel);
    expect(vessel.speedLaden).toBe('12 kts');    // not overwritten
    expect(vessel.consumption).toBe('26 mt/day'); // patched
  });

  it('does not overwrite existing consumption when only speedLaden missing', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV BORIS',
      dwtSummer: { value: 56_000, confidence: 'confirmed' },
      speedLaden: null,
      consumption: '28 mt/day',
    };
    patchVesselItem(vessel);
    expect(vessel.speedLaden).toBe('13 kts');     // patched
    expect(vessel.consumption).toBe('28 mt/day'); // not overwritten
  });

  it('does not patch when DWT is unknown (null dwt → null defaults)', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV UNKNOWN',
      dwtSummer: null,
      dwcc: null,
      speedLaden: null,
      consumption: null,
    };
    const modified = patchVesselItem(vessel);
    expect(modified).toBe(false);
    expect(vessel.speedLaden).toBeNull();
    expect(vessel.consumption).toBeNull();
  });

  it('falls back to dwcc when dwtSummer absent', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV CAPESIZE',
      dwtSummer: null,
      dwcc: { value: 150_000, confidence: 'estimated' },
      speedLaden: null,
      consumption: null,
    };
    patchVesselItem(vessel);
    expect(vessel.speedLaden).toBe('14.5 kts');  // capesize
    expect(vessel.consumption).toBe('38 mt/day');
  });

  it('does not corrupt other vessel fields', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV TEST',
      openDate: '2026-07-01',
      openPosition: 'Rotterdam',
      dwtSummer: { value: 28_000, confidence: 'confirmed' },
      speedLaden: null,
      consumption: null,
      imo: '1234567',
      flag: 'Liberia',
    };
    patchVesselItem(vessel);
    expect(vessel.vesselName).toBe('MV TEST');
    expect(vessel.openDate).toBe('2026-07-01');
    expect(vessel.openPosition).toBe('Rotterdam');
    expect(vessel.imo).toBe('1234567');
    expect(vessel.flag).toBe('Liberia');
    // patched fields
    expect(vessel.speedLaden).toBe('12.5 kts');
    expect(vessel.consumption).toBe('22 mt/day');
  });

  it('re-run after first patch is a no-op (idempotency)', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV REPEAT',
      dwtSummer: { value: 56_000, confidence: 'confirmed' },
      speedLaden: null,
      consumption: null,
    };
    const first = patchVesselItem(vessel);
    expect(first).toBe(true);
    const second = patchVesselItem(vessel);
    expect(second).toBe(false);   // already populated → no-op
    expect(vessel.speedLaden).toBe('13 kts');
    expect(vessel.consumption).toBe('26 mt/day');
  });
});
