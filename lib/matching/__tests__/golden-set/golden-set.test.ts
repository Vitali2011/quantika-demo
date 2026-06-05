import fixture from './golden-matches.json';
import { parseGoldenRecord } from './schema';
import { withinTolerance } from './tolerance';
import { runGolden } from './runner';

const FROZEN = new Date(`${fixture.frozenDate}T00:00:00.000Z`);
const records = fixture.matches.map(parseGoldenRecord);

describe('golden-set · value oracle', () => {
  for (const r of records) {
    describe(`${r.id} (${r.bugClass})`, () => {
      it('weight matches stated value', async () => {
        const a = await runGolden(r, FROZEN);
        expect(a.weightMt).not.toBeNull();
        expect(withinTolerance(a.weightMt as number, r.expected.weightT)).toBe(true);
      });

      it('distance within tolerance of external searoute', async () => {
        const a = await runGolden(r, FROZEN);
        expect(a.distanceNm).not.toBeNull();
        expect(withinTolerance(a.distanceNm as number, r.expected.distanceNm)).toBe(true);
      });

      it('tce within tolerance', async () => {
        const a = await runGolden(r, FROZEN);
        expect(a.tceUsdPerDay).not.toBeNull();
        expect(withinTolerance(a.tceUsdPerDay as number, r.expected.tcePerDay)).toBe(true);
      });

      if (r.engineMust.speedMarkedEst) {
        it.failing('engine marks default speed as est. (known gap until a fix lands)', async () => {
          const a = await runGolden(r, FROZEN);
          // No est flag exists yet -> this throws -> it.failing PASSES.
          // When a fix adds the flag, promote this to a real `it`.
          expect((a as { speedSource?: string }).speedSource).toBe('estimated');
        });
      }
    });
  }
});
