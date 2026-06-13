/**
 * Tests for lastcargoes-patch.ts — backfill transform used by
 * backfill-lastcargoes.ts (audit D revive).
 *
 * Pure functions only — no DB, no CLI. Mirrors charterer-extract.test.ts.
 */
import { applyLastCargoesPatch, patchResultJsonLastCargoes } from '../lastcargoes-patch';

describe('applyLastCargoesPatch', () => {
  it('sets lastCargoes on items where it is null or absent', () => {
    const items = [{ vesselName: { value: 'MV A' } }, { vesselName: { value: 'MV B' }, lastCargoes: null }];
    const { patched } = applyLastCargoesPatch(items, 'coal, grain');
    expect(patched).toBe(2);
    expect(items[0]['lastCargoes']).toBe('coal, grain');
    expect(items[1]['lastCargoes']).toBe('coal, grain');
  });

  it('leaves existing non-null lastCargoes untouched', () => {
    const items = [{ lastCargoes: 'steel' }];
    const { patched } = applyLastCargoesPatch(items, 'coal, grain');
    expect(patched).toBe(0);
    expect(items[0].lastCargoes).toBe('steel');
  });

  it('second run patches 0 items (idempotent)', () => {
    const items: Record<string, unknown>[] = [{ vesselName: { value: 'MV A' } }];
    expect(applyLastCargoesPatch(items, 'coal').patched).toBe(1);
    expect(applyLastCargoesPatch(items, 'coal').patched).toBe(0);
  });
});

describe('patchResultJsonLastCargoes', () => {
  it('patches a JSON-array payload, preserving other fields', () => {
    const json = JSON.stringify([{ emailId: 'e1', vesselName: { value: 'MV A' }, lastCargoes: null, dwtSummer: { value: 3222 } }]);
    const { json: out, patched } = patchResultJsonLastCargoes(json, 'coal, grain, urea');
    expect(patched).toBe(1);
    const items = JSON.parse(out);
    expect(items[0].lastCargoes).toBe('coal, grain, urea');
    expect(items[0].dwtSummer).toEqual({ value: 3222 });
    expect(items[0].emailId).toBe('e1');
  });

  it('preserves a bare-object root shape', () => {
    const json = JSON.stringify({ emailId: 'e1', lastCargoes: null });
    const { json: out, patched } = patchResultJsonLastCargoes(json, 'coal');
    expect(patched).toBe(1);
    const root = JSON.parse(out);
    expect(Array.isArray(root)).toBe(false);
    expect(root.lastCargoes).toBe('coal');
  });

  it('returns patched=0 and identical content when all items already have values (idempotent)', () => {
    const json = JSON.stringify([{ emailId: 'e1', lastCargoes: 'steel' }]);
    const { json: out, patched } = patchResultJsonLastCargoes(json, 'coal');
    expect(patched).toBe(0);
    expect(JSON.parse(out)).toEqual(JSON.parse(json));
  });
});
