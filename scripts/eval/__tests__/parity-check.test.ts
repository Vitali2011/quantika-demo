/**
 * Unit tests for the parity-check utility (#791 cause C).
 *
 * Deterministic (no LLM, no DB) — guards the parity contract used by the
 * corpus re-parse runner.
 */
import { diffParsed, diffParsedFromPaths } from '../parity-check-parsed-cargoes';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('parity-check (#791 cause C)', () => {
  it('detects populated→null regression on non-weight field', () => {
    const oldArr = [{
      emailId: 'a', itemIndex: 0,
      originPort: { value: 'X', confidence: 'confirmed' },
    }];
    const newArr = [{
      emailId: 'a', itemIndex: 0,
      originPort: null,
    }];
    const r = diffParsed(oldArr, newArr);
    expect(r.populated_now_null).toHaveLength(1);
    expect(r.populated_now_null[0].field).toBe('originPort');
  });

  it('records weight null→populated as a win, not a regression', () => {
    const oldArr = [{ emailId: 'a', itemIndex: 0, weightMt: null }];
    const newArr = [{
      emailId: 'a', itemIndex: 0,
      weightMt: { value: 186, confidence: 'interpreted' },
    }];
    const r = diffParsed(oldArr, newArr);
    expect(r.null_now_populated).toHaveLength(1);
    expect(r.null_now_populated[0].field).toBe('weightMt');
    expect(r.populated_now_null).toHaveLength(0);
  });

  it('reports value_changed when a populated field shifts', () => {
    const oldArr = [{
      emailId: 'a', itemIndex: 0,
      cargoDescription: { value: 'Salt', confidence: 'confirmed' },
    }];
    const newArr = [{
      emailId: 'a', itemIndex: 0,
      cargoDescription: { value: 'Sea salt', confidence: 'interpreted' },
    }];
    const r = diffParsed(oldArr, newArr);
    expect(r.value_changed).toHaveLength(1);
    expect(r.value_changed[0].field).toBe('cargoDescription');
  });

  it('skips items missing from old (new emails are out of parity scope)', () => {
    const oldArr = [{ emailId: 'a', itemIndex: 0, originPort: { value: 'X' } }];
    const newArr = [
      { emailId: 'a', itemIndex: 0, originPort: { value: 'X' } },
      { emailId: 'b', itemIndex: 0, originPort: { value: 'Y' } },
    ];
    const r = diffParsed(oldArr, newArr);
    expect(r.total).toBe(1);
    expect(r.populated_now_null).toHaveLength(0);
    expect(r.null_now_populated).toHaveLength(0);
    expect(r.value_changed).toHaveLength(0);
  });

  it('keys by (emailId, itemIndex) — multi-item emails matched per-item', () => {
    const oldArr = [
      { emailId: 'a', itemIndex: 0, weightMt: { value: 100 } },
      { emailId: 'a', itemIndex: 1, weightMt: { value: 200 } },
    ];
    const newArr = [
      { emailId: 'a', itemIndex: 0, weightMt: { value: 100 } },
      { emailId: 'a', itemIndex: 1, weightMt: { value: 250 } },
    ];
    const r = diffParsed(oldArr, newArr);
    expect(r.value_changed).toHaveLength(1);
    expect(r.value_changed[0].itemIndex).toBe(1);
  });

  it('diffParsedFromPaths reads JSON files and computes the same report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parity-'));
    const oldP = join(dir, 'old.json');
    const newP = join(dir, 'new.json');
    writeFileSync(oldP, JSON.stringify([{ emailId: 'a', itemIndex: 0, weightMt: null, weightMtMax: 4800 }]));
    writeFileSync(newP, JSON.stringify([{
      emailId: 'a', itemIndex: 0, weightMt: null, weightMtMax: 4800,
    }]));
    const r = diffParsedFromPaths(oldP, newP);
    expect(r.populated_now_null).toHaveLength(0);
    expect(r.null_now_populated).toHaveLength(0);
    expect(r.value_changed).toHaveLength(0);
  });

  it('treats undefined and null as equivalent (both "absent")', () => {
    const oldArr = [{ emailId: 'a', itemIndex: 0, dimensions: null }];
    const newArr = [{ emailId: 'a', itemIndex: 0 }];
    const r = diffParsed(oldArr, newArr);
    // null in old, missing/undefined in new — no change.
    expect(r.populated_now_null).toHaveLength(0);
    expect(r.value_changed).toHaveLength(0);
  });
});
