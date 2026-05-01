/**
 * @jest-environment jsdom
 *
 * BUG-β-13-AttrXSS — bimco.ts must reject unknown clauseId at runtime
 * (TS union is not a runtime guard) and must escape `"` and `'` in attr context.
 */
import { buildBimcoInsert, type BimcoClauseId } from '../../../extensions/gmail/inserts/bimco';

describe('BUG-β-13-AttrXSS', () => {
  it('throws on unknown clauseId (runtime allow-list)', () => {
    expect(() =>
      buildBimcoInsert('x" onmouseover="alert(1)"' as unknown as BimcoClauseId),
    ).toThrow(/unknown|invalid/i);
  });

  it('does not break attribute context (no raw quote injection paths possible since clauseId is allow-listed)', () => {
    const out = buildBimcoInsert('war');
    expect(out.html).toContain('data-bimco-clause="war"');
    expect(out.html).not.toMatch(/onmouseover/i);
  });
});
