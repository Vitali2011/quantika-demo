/**
 * test-skill wave-c review — GROUP_A_RESTRICTION_RE phrasing pins (audit C.3).
 * Branch: feat/wave-c-engine-logic · HEAD: 13029428
 *
 * The new Group A hard-block regex (lib/sailing/imsbc-check.ts:279) guards the
 * IMMEDIATE next word after "no" (more/less/restrictions) and allows up to 40
 * arbitrary chars before the hazard token. Two residual weakness classes,
 * PINNED here as current behaviour [BEHAVIOR] so a future tightening flips
 * them consciously:
 *
 * FALSE POSITIVES (verdict 'incompatible' kills the pair via the hard gate —
 * lost match for a vessel that explicitly ACCEPTS the cargo):
 *   - acceptance phrasing where more/less/restrictions is NOT the immediate
 *     next word: "no cargo restrictions, concentrates welcome"
 *   - 40-char window bridging across clause/sentence boundaries:
 *     "no DG cargoes. TML certificate on board" (DG-only ban + TML cert),
 *     "no grabs, holds suitable for concentrates" (gear statement)
 *
 * FALSE NEGATIVES (miss → stays 'caution'; conservative, lower harm):
 *   - "cannot carry concentrates", "concentrates not accepted"
 */
import { checkImsbcLoadability } from '@/lib/sailing/imsbc-check';

const verdict = (restriction: string) =>
  checkImsbcLoadability('nickel ore', { restrictions: [restriction] }).verdict;

// FLIPPED 2026-06-12 (QA F2 fix): the window no longer bridges clause/sentence
// boundaries ([^.;,]) and cannot/can't prohibition verbs are recognised.
describe('GROUP_A_RESTRICTION_RE — former false positives now stay caution', () => {
  it.each([
    ['no cargo restrictions, concentrates welcome'],
    ['no DG cargoes. TML certificate on board'],
    ['no grabs, holds suitable for concentrates'],
  ])('acceptance/unrelated phrasing "%s" does NOT hard-block Group A', (r) => {
    expect(verdict(r)).toBe('caution');
  });
});

describe('GROUP_A_RESTRICTION_RE — prohibition verb coverage', () => {
  it.each([['cannot carry concentrates'], ["can't load nickel ore"]])(
    'prohibition "%s" hard-blocks',
    (r) => {
      expect(verdict(r)).toBe('incompatible');
    },
  );

  it.each([['concentrates not accepted'], ['no DG, concentrates']])(
    '[BEHAVIOR] trailing-negation / comma-list "%s" stays caution (documented conservative miss)',
    (r) => {
      expect(verdict(r)).toBe('caution');
    },
  );
});

describe('GROUP_A_RESTRICTION_RE — guards that must keep holding', () => {
  it.each([
    ['moisture content no more than TML', 'caution'],
    ['no restrictions on concentrates', 'caution'],
    ['no liquefied petroleum gas', 'caution'],
    ['no concentrates', 'incompatible'],
    ['no cargoes prone to liquefaction', 'incompatible'],
  ])('"%s" → %s', (r, v) => {
    expect(verdict(r)).toBe(v);
  });
});
