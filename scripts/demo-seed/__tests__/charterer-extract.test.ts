/**
 * Tests for charterer-extract.ts — shared regex extraction + backfill transform
 * used by seed-charterers.ts and backfill-charterer.ts (audit A.1).
 *
 * Pure functions only — no DB, no CLI.
 */
import {
  extractChartererNames,
  extractChartererName,
  applyChartererPatch,
  patchResultJson,
} from '../charterer-extract';

// ─── extractChartererNames: acceptance ───────────────────────────────────────

describe('extractChartererNames — acceptance', () => {
  it("extracts from 'Acct: Huaya'", () => {
    expect(extractChartererNames('Acct: Huaya')).toEqual(['Huaya']);
  });

  it("extracts from 'Chtrs: Grain Trader A'", () => {
    expect(extractChartererNames('Chtrs: Grain Trader A')).toEqual(['Grain Trader A']);
  });

  it("extracts from bare 'Account COFCO' (no colon)", () => {
    expect(extractChartererNames('Account COFCO')).toEqual(['COFCO']);
  });

  it("extracts from corpus form '- ACCT:  GRAIN TRADER A' (double space after colon)", () => {
    expect(extractChartererNames('- ACCT:  GRAIN TRADER A')).toEqual(['GRAIN TRADER A']);
  });

  it("extracts from corpus form '-CHARTERERS : GRAIN TRADER A '", () => {
    expect(extractChartererNames('-CHARTERERS : GRAIN TRADER A ')).toEqual(['GRAIN TRADER A']);
  });

  it("extracts from corpus form 'Account Messers GRAIN TRADER B'", () => {
    expect(extractChartererNames('MV SEAGULL 92 - Safi / Georgetown - Account Messers GRAIN TRADER B ')).toEqual([
      'GRAIN TRADER B',
    ]);
  });
});

// ─── extractChartererNames: rejection ────────────────────────────────────────

describe('extractChartererNames — rejection', () => {
  it('returns [] for a body without any charterer mention', () => {
    expect(extractChartererNames('MV SEAGULL 1 open Constanta 15-20 May, 25000 dwt, grain clean.')).toEqual([]);
  });

  it('returns [] for empty / blank body', () => {
    expect(extractChartererNames('')).toEqual([]);
    expect(extractChartererNames('   \n  ')).toEqual([]);
  });

  it("rejects boilerplate 'CHARTERERS ACCOUNT AT BOTH ENDS' (stopword after bare account)", () => {
    expect(extractChartererNames('LASHING TO BE FOR CHARTERERS ACCOUNT AT BOTH ENDS.')).toEqual([]);
  });

  it("rejects 'CHRTS ACCT AND TIME TO COUNT AS LAYTIME' (no colon, acct has no bare form)", () => {
    expect(extractChartererNames('CHRTS ACCT AND TIME TO COUNT AS LAYTIME.')).toEqual([]);
  });

  it("rejects label with empty value ('- ACCT:' at end of line, name on next line not swallowed)", () => {
    expect(extractChartererNames('- ACCT:  \n- LAYCAN: 15-20 MAY')).toEqual([]);
  });

  it("rejects bank-account boilerplate ('FULL FREIGHT IN THEIR BANK ACCOUNT.')", () => {
    expect(extractChartererNames('FULL FREIGHT IN THEIR BANK ACCOUNT.')).toEqual([]);
  });

  it("rejects dangling 'Account Messers' with no name after it", () => {
    expect(extractChartererNames('Account Messers ')).toEqual([]);
  });
});

// ─── extractChartererNames: cleanup + dedupe ─────────────────────────────────

describe('extractChartererNames — trailing-noise truncation + dedupe', () => {
  it('truncates at opening parenthesis', () => {
    expect(extractChartererNames('- ACCT:  GRAIN TRADER B (last done USD 25 pmt)')).toEqual(['GRAIN TRADER B']);
  });

  it('truncates at column-style double-space separator inside the capture', () => {
    expect(extractChartererNames('ACCT: HUAYA   FRT IDEAS USD 30')).toEqual(['HUAYA']);
  });

  it('strips trailing punctuation noise', () => {
    expect(extractChartererNames("Charterers: Grain Trader A - ")).toEqual(['Grain Trader A']);
  });

  it('dedupes case-insensitively across multiple mentions, keeping first-seen form', () => {
    expect(extractChartererNames('Acct: HUAYA\nsome terms\nCharterers: huaya')).toEqual(['HUAYA']);
  });

  it('returns multiple distinct names in order of appearance', () => {
    expect(extractChartererNames('Acct: Huaya\nCharterers: Grain Trader A')).toEqual(['Huaya', 'Grain Trader A']);
  });
});

// ─── extractChartererName (first hit) ────────────────────────────────────────

describe('extractChartererName', () => {
  it('returns the first extracted name', () => {
    expect(extractChartererName('Acct: Huaya\nCharterers: Grain Trader A')).toBe('Huaya');
  });

  it('returns null when nothing is found', () => {
    expect(extractChartererName('no counterparty mentioned here')).toBeNull();
  });
});

// ─── applyChartererPatch ─────────────────────────────────────────────────────

describe('applyChartererPatch', () => {
  it('sets chartererName on items missing the key', () => {
    const items: Record<string, unknown>[] = [{ emailId: 'a', cargoType: 'BULK' }];
    const { patched } = applyChartererPatch(items, 'Huaya');
    expect(patched).toBe(1);
    expect(items[0]['chartererName']).toBe('Huaya');
  });

  it('sets chartererName on items where the value is explicitly null', () => {
    const items: Record<string, unknown>[] = [{ emailId: 'a', chartererName: null }];
    const { patched } = applyChartererPatch(items, 'Huaya');
    expect(patched).toBe(1);
    expect(items[0]['chartererName']).toBe('Huaya');
  });

  it('leaves an existing non-null value untouched', () => {
    const items: Record<string, unknown>[] = [{ emailId: 'a', chartererName: 'COFCO' }];
    const { patched } = applyChartererPatch(items, 'Huaya');
    expect(patched).toBe(0);
    expect(items[0]['chartererName']).toBe('COFCO');
  });

  it('does not modify other fields', () => {
    const items: Record<string, unknown>[] = [{ emailId: 'a', cargoType: 'BULK', weightMt: 45000 }];
    applyChartererPatch(items, 'Huaya');
    expect(items[0]['cargoType']).toBe('BULK');
    expect(items[0]['weightMt']).toBe(45000);
  });

  it('is idempotent: second run patches 0 items', () => {
    const items: Record<string, unknown>[] = [{ emailId: 'a' }, { emailId: 'a', chartererName: null }];
    expect(applyChartererPatch(items, 'Huaya').patched).toBe(2);
    expect(applyChartererPatch(items, 'Someone Else').patched).toBe(0);
    expect(items[0]['chartererName']).toBe('Huaya');
    expect(items[1]['chartererName']).toBe('Huaya');
  });
});

// ─── patchResultJson (root-shape handling) ───────────────────────────────────

describe('patchResultJson', () => {
  it('patches an array-root result_json and keeps the array root', () => {
    const src = JSON.stringify([{ emailId: 'e1' }, { emailId: 'e1', chartererName: 'COFCO' }]);
    const { json, patched } = patchResultJson(src, 'Huaya');
    expect(patched).toBe(1);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].chartererName).toBe('Huaya');
    expect(parsed[1].chartererName).toBe('COFCO');
  });

  it('patches an object-root result_json and keeps the object root', () => {
    const src = JSON.stringify({ emailId: 'e1', cargoType: 'BULK' });
    const { json, patched } = patchResultJson(src, 'Huaya');
    expect(patched).toBe(1);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.chartererName).toBe('Huaya');
    expect(parsed.cargoType).toBe('BULK');
  });

  it('second pass over its own output patches 0 items (idempotent)', () => {
    const src = JSON.stringify([{ emailId: 'e1' }]);
    const first = patchResultJson(src, 'Huaya');
    const second = patchResultJson(first.json, 'Huaya');
    expect(second.patched).toBe(0);
    expect(second.json).toBe(first.json);
  });
});
