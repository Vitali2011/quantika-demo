import {
  defaultSpeedConsumption,
  extractDwt,
  asItems,
  patchVesselItem,
  extractNumericValue,
  normalizeSpeedField,
  normalizeConsumptionField,
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

// ── extractNumericValue ───────────────────────────────────────────────────────

describe('extractNumericValue', () => {
  it('extracts plain integer', () => {
    expect(extractNumericValue(13)).toBe(13);
  });

  it('extracts plain decimal', () => {
    expect(extractNumericValue(12.5)).toBe(12.5);
  });

  it('extracts from ConfidenceField with numeric value', () => {
    expect(extractNumericValue({ value: 13, confidence: 'confirmed', source_text: '13 knts' })).toBe(13);
  });

  it('extracts from ConfidenceField with string value', () => {
    expect(extractNumericValue({ value: '13 knts', confidence: 'confirmed' })).toBe(13);
  });

  it('extracts from normalized string "13 kts"', () => {
    expect(extractNumericValue('13 kts')).toBe(13);
  });

  it('extracts from non-normalized string "13 knts"', () => {
    expect(extractNumericValue('13 knts')).toBe(13);
  });

  it('extracts from string "12.5 kts"', () => {
    expect(extractNumericValue('12.5 kts')).toBe(12.5);
  });

  it('extracts from string "22 mt/day"', () => {
    expect(extractNumericValue('22 mt/day')).toBe(22);
  });

  it('returns null for null', () => {
    expect(extractNumericValue(null)).toBeNull();
  });

  it('returns null for zero', () => {
    expect(extractNumericValue(0)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractNumericValue('')).toBeNull();
  });

  it('returns null for ConfidenceField with zero value', () => {
    expect(extractNumericValue({ value: 0, confidence: 'estimated' })).toBeNull();
  });
});

// ── normalizeSpeedField / normalizeConsumptionField ───────────────────────────

describe('normalizeSpeedField', () => {
  it('normalizes ConfidenceField to "N kts"', () => {
    expect(normalizeSpeedField({ value: 13, confidence: 'confirmed' })).toBe('13 kts');
  });

  it('normalizes plain number to "N kts"', () => {
    expect(normalizeSpeedField(14)).toBe('14 kts');
  });

  it('normalizes non-standard string "13 knts" to "13 kts"', () => {
    expect(normalizeSpeedField('13 knts')).toBe('13 kts');
  });

  it('round-trips already-normalized "13 kts" unchanged', () => {
    expect(normalizeSpeedField('13 kts')).toBe('13 kts');
  });

  it('returns null for null', () => {
    expect(normalizeSpeedField(null)).toBeNull();
  });
});

describe('normalizeConsumptionField', () => {
  it('normalizes ConfidenceField to "N mt/day"', () => {
    expect(normalizeConsumptionField({ value: 22, confidence: 'confirmed' })).toBe('22 mt/day');
  });

  it('normalizes plain number to "N mt/day"', () => {
    expect(normalizeConsumptionField(28)).toBe('28 mt/day');
  });

  it('round-trips already-normalized "22 mt/day" unchanged', () => {
    expect(normalizeConsumptionField('22 mt/day')).toBe('22 mt/day');
  });

  it('returns null for null', () => {
    expect(normalizeConsumptionField(null)).toBeNull();
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

  // ── Adversarial: existing-value preservation across all shapes ────────────
  // These are the cases the original impl missed — real values were overwritten.

  it('ConfidenceField speedLaden preserved — NOT overwritten with DWT default', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV CONFIRMED',
      dwtSummer: { value: 28_000, confidence: 'confirmed' }, // small → default 12.5 kts
      speedLaden: { value: 13, confidence: 'confirmed', source_text: '13 knts' }, // real = 13
      consumption: null,
    };
    const modified = patchVesselItem(vessel);
    expect(modified).toBe(true);
    expect(vessel.speedLaden).toBe('13 kts');     // preserved, NOT '12.5 kts'
    expect(vessel.consumption).toBe('22 mt/day'); // defaulted (was null)
  });

  it('non-normalized string "13 knts" normalized to "13 kts" — NOT overwritten with default', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV TYPO',
      dwtSummer: { value: 28_000, confidence: 'confirmed' }, // small → default 12.5 kts
      speedLaden: '13 knts', // non-standard string, real value 13
      consumption: null,
    };
    const modified = patchVesselItem(vessel);
    expect(modified).toBe(true);
    expect(vessel.speedLaden).toBe('13 kts'); // normalized from '13 knts', NOT '12.5 kts'
  });

  it('plain number speedLaden preserved — NOT overwritten with DWT default', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV NUMBER',
      dwtSummer: { value: 28_000, confidence: 'confirmed' }, // small → default 12.5 kts
      speedLaden: 13,  // plain number
      consumption: 22, // plain number
    };
    const modified = patchVesselItem(vessel);
    expect(modified).toBe(true);
    expect(vessel.speedLaden).toBe('13 kts');     // NOT '12.5 kts' default
    expect(vessel.consumption).toBe('22 mt/day');
  });

  it('idempotent after normalizing ConfidenceField — second run is no-op', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV IDEMPOTENT',
      dwtSummer: { value: 28_000, confidence: 'confirmed' },
      speedLaden: { value: 13, confidence: 'confirmed' },
      consumption: { value: 22, confidence: 'confirmed' },
    };
    const first = patchVesselItem(vessel);
    expect(first).toBe(true);
    expect(vessel.speedLaden).toBe('13 kts');
    expect(vessel.consumption).toBe('22 mt/day');

    const second = patchVesselItem(vessel);
    expect(second).toBe(false); // already normalized → no-op
    expect(vessel.speedLaden).toBe('13 kts');     // unchanged
    expect(vessel.consumption).toBe('22 mt/day'); // unchanged
  });

  it('both ConfidenceField fields preserved — neither overwritten by DWT defaults', () => {
    const vessel: Record<string, unknown> = {
      vesselName: 'MV BOTH',
      dwtSummer: { value: 56_000, confidence: 'confirmed' }, // handymax → default 13 kts / 26 mt/day
      speedLaden: { value: 14, confidence: 'confirmed', source_text: '14 knts' },
      consumption: { value: 28, confidence: 'confirmed', source_text: '28 mt/day' },
    };
    patchVesselItem(vessel);
    expect(vessel.speedLaden).toBe('14 kts');     // NOT '13 kts' default
    expect(vessel.consumption).toBe('28 mt/day'); // NOT '26 mt/day' default
  });
});
