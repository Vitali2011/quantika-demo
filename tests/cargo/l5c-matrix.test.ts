/**
 * Input Contract for checkCompatibility:
 *   prevCargoes: string[] — Last ≤5 cargoes, freshest first. Empty = clean slate.
 *   newCargo:    string   — Cargo about to be loaded.
 *
 * | Class               | Example                          | Decision                                |
 * |---------------------|----------------------------------|-----------------------------------------|
 * | Empty prevCargoes   | []                               | compatible:true, no warnings            |
 * | Empty newCargo      | ""                               | compatible:true, no warnings            |
 * | Unknown pair        | "titanium" → "grain"             | compatible:true + info-warning          |
 * | Case/alias norm     | "WHEAT", "Wheat", "HBI", "corn"  | normalized before lookup                |
 * | Multiple blockers   | ["DRI","coal"] → "grain"         | all pairs in blocking_pairs             |
 */
import { checkCompatibility } from '@/lib/cargo/l5c-matrix';

import fixture01 from '../fixtures/l5c-pairs/01-dri-grain.json';
import fixture02 from '../fixtures/l5c-pairs/02-coal-grain.json';
import fixture03 from '../fixtures/l5c-pairs/03-coal-bauxite.json';
import fixture04 from '../fixtures/l5c-pairs/04-bauxite-grain.json';
import fixture05 from '../fixtures/l5c-pairs/05-sugar-scrap.json';
import fixture06 from '../fixtures/l5c-pairs/06-scrap-sugar.json';
import fixture07 from '../fixtures/l5c-pairs/07-fertilizer-urea-grain.json';
import fixture08 from '../fixtures/l5c-pairs/08-petcoke-grain.json';
import fixture09 from '../fixtures/l5c-pairs/09-salt-steel.json';
import fixture10 from '../fixtures/l5c-pairs/10-iron-ore-grain.json';

const FIXTURES = [
  fixture01, fixture02, fixture03, fixture04, fixture05,
  fixture06, fixture07, fixture08, fixture09, fixture10,
];

describe('checkCompatibility — L5C matrix', () => {
  describe('10 reference pair verdicts', () => {
    test.each(FIXTURES)('$description', ({ prevCargoes, newCargo, expected }) => {
      const result = checkCompatibility(prevCargoes, newCargo);
      expect(result.compatible).toBe(expected.compatible);
      expect(result.requires_extra_clean).toBe(expected.requires_extra_clean);
      if (expected.blocking_pairs.length > 0) {
        expect(result.blocking_pairs).toHaveLength(expected.blocking_pairs.length);
        for (const bp of expected.blocking_pairs) {
          expect(result.blocking_pairs).toEqual(
            expect.arrayContaining([expect.objectContaining({ previous: bp.previous })])
          );
        }
      } else {
        expect(result.blocking_pairs).toHaveLength(0);
      }
    });
  });

  describe('edge cases', () => {
    it('empty prevCargoes returns compatible:true with no warnings', () => {
      const result = checkCompatibility([], 'grain');
      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.requires_extra_clean).toBe(false);
      expect(result.blocking_pairs).toHaveLength(0);
    });

    it('empty newCargo returns compatible:true with no warnings', () => {
      const result = checkCompatibility(['coal'], '');
      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('unknown cargo pair returns compatible:true with info-warning', () => {
      const result = checkCompatibility(['titanium'], 'grain');
      expect(result.compatible).toBe(true);
      expect(result.blocking_pairs).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/no l5c data/i);
    });

    describe('alias normalization', () => {
      it('"wheat" is treated as grain — coal→grain incompatible', () => {
        const result = checkCompatibility(['coal'], 'wheat');
        expect(result.compatible).toBe(false);
      });

      it('"WHEAT" is treated as grain', () => {
        const result = checkCompatibility(['coal'], 'WHEAT');
        expect(result.compatible).toBe(false);
      });

      it('"Wheat" is treated as grain', () => {
        const result = checkCompatibility(['coal'], 'Wheat');
        expect(result.compatible).toBe(false);
      });

      it('"HBI" is treated as DRI — DRI→grain incompatible', () => {
        const result = checkCompatibility(['HBI'], 'grain');
        expect(result.compatible).toBe(false);
      });

      it('"corn" is treated as grain', () => {
        const result = checkCompatibility(['coal'], 'corn');
        expect(result.compatible).toBe(false);
      });

      it('"iron ore" is treated as iron-ore — requires extra clean', () => {
        const result = checkCompatibility(['iron ore'], 'grain');
        expect(result.requires_extra_clean).toBe(true);
      });
    });

    it('multiple blocking pairs in L5 are all reported in blocking_pairs', () => {
      const result = checkCompatibility(['DRI', 'coal'], 'grain');
      expect(result.compatible).toBe(false);
      expect(result.blocking_pairs).toHaveLength(2);
      const prevs = result.blocking_pairs.map((bp) => bp.previous);
      expect(prevs).toContain('DRI');
      expect(prevs).toContain('coal');
    });
  });
});
