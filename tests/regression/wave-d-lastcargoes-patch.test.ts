/**
 * test-skill adversarial regression — wave D (feat/wave-d-revive-cleanup @ 7bb062ec)
 * Class: data-contract / merger (backfill patch transform).
 * Invariants: existing non-null values NEVER overwritten; idempotent;
 * root shape preserved (array vs bare object); sibling fields untouched.
 */
import {
  applyLastCargoesPatch,
  patchResultJsonLastCargoes,
} from '../../scripts/demo-seed/lastcargoes-patch';

describe('applyLastCargoesPatch — no-clobber invariant', () => {
  it('never overwrites an existing non-null value', () => {
    const items = [{ lastCargoes: 'steel' }, { lastCargoes: null }, {}];
    const { patched } = applyLastCargoesPatch(items, 'coal');
    expect(patched).toBe(2);
    expect(items[0].lastCargoes).toBe('steel');
    expect(items[1].lastCargoes).toBe('coal');
    expect(items[2].lastCargoes).toBe('coal');
  });

  it('empty-string value is treated as SET (not clobbered) — pinned current behavior', () => {
    const items = [{ lastCargoes: '' }];
    const { patched } = applyLastCargoesPatch(items, 'coal');
    expect(patched).toBe(0);
    expect(items[0].lastCargoes).toBe('');
  });

  it('second run patches 0 (idempotent)', () => {
    const items: Record<string, unknown>[] = [{ lastCargoes: null }];
    applyLastCargoesPatch(items, 'coal');
    const second = applyLastCargoesPatch(items, 'coal');
    expect(second.patched).toBe(0);
  });
});

describe('patchResultJsonLastCargoes — shape preservation', () => {
  it('array root stays an array, sibling fields byte-identical', () => {
    const src = JSON.stringify([
      { vesselName: { value: 'A', confidence: 'confirmed' }, imo: '1234567', lastCargoes: null, dwtSummer: { value: 12000 } },
      { vesselName: 'B', lastCargoes: 'steel' },
    ]);
    const { json, patched } = patchResultJsonLastCargoes(src, 'coal');
    expect(patched).toBe(1);
    const out = JSON.parse(json);
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].vesselName).toEqual({ value: 'A', confidence: 'confirmed' });
    expect(out[0].dwtSummer).toEqual({ value: 12000 });
    expect(out[0].lastCargoes).toBe('coal');
    expect(out[1].lastCargoes).toBe('steel');
  });

  it('bare-object root stays a bare object', () => {
    const src = JSON.stringify({ vesselName: 'A', lastCargoes: null });
    const { json, patched } = patchResultJsonLastCargoes(src, 'coal');
    expect(patched).toBe(1);
    const out = JSON.parse(json);
    expect(Array.isArray(out)).toBe(false);
    expect(out.lastCargoes).toBe('coal');
  });

  it('round-trips through JSON.parse (app reader path is JSON.parse)', () => {
    const src = JSON.stringify([{ a: 1, b: [1, 2], c: { d: null }, lastCargoes: null }]);
    const { json } = patchResultJsonLastCargoes(src, 'coal');
    expect(() => JSON.parse(json)).not.toThrow();
    const out = JSON.parse(json)[0];
    expect(out.a).toBe(1);
    expect(out.b).toEqual([1, 2]);
    expect(out.c).toEqual({ d: null });
  });

  it('idempotent at the JSON level: second pass patches 0 and is byte-stable', () => {
    const src = JSON.stringify([{ lastCargoes: null }]);
    const first = patchResultJsonLastCargoes(src, 'coal');
    const second = patchResultJsonLastCargoes(first.json, 'coal');
    expect(second.patched).toBe(0);
    expect(second.json).toBe(first.json);
  });

  it('malformed JSON throws loudly (no silent corruption)', () => {
    expect(() => patchResultJsonLastCargoes('not json {{{', 'coal')).toThrow();
  });
});
