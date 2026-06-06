import fixture from './golden-matches.json';
import { parseGoldenRecord } from './schema';
import { withinTolerance } from './tolerance';
import { runGolden } from './runner';

const FROZEN = new Date(`${fixture.frozenDate}T00:00:00.000Z`);
const records = fixture.matches.map(parseGoldenRecord);

// Design (see golden-matches.json "note" + docs/superpowers/golden-set/):
// - Generic weight/distance/tce tests assert COMPUTABILITY + wide bands only. The engine
//   systematically uses the ballast/short leg as voyage distance, so engine TCE is a mirage
//   even for good controls -> we don't assert its magnitude yet.
// - The real oracle = engineMust gate flags. Per the baseline run, the LIVE engine
//   (analyzePairs) already enforces most gates (trading-restriction, laycan, capacity,
//   spot-not-main, below-OPEX-not-good, weight-range loss) -> those assert as green `it`.
//   The gates the engine does NOT enforce yet are listed in each record's `xfail` and assert
//   as `it.failing` (red now, auto-flip green when a fix lands). Controls assert tceSign
//   positive = the green belt.
describe('golden-set · value oracle', () => {
  for (const r of records) {
    const xfail = r.xfail ?? [];
    // gate assertion: it.failing iff this key is a known-unfixed gap, else a real green it.
    const gate = (key: string, name: string, fn: () => Promise<void>) =>
      (xfail.includes(key) ? it.failing : it)(name, fn);

    describe(`${r.id} (${r.bugClass})`, () => {
      it('weight matches stated value', async () => {
        const a = await runGolden(r, FROZEN);
        expect(a.weightMt).not.toBeNull();
        expect(withinTolerance(a.weightMt as number, r.expected.weightT)).toBe(true);
      });

      gate('distance', 'distance within (wide) tolerance of external searoute', async () => {
        const a = await runGolden(r, FROZEN);
        expect(a.distanceNm).not.toBeNull();
        expect(withinTolerance(a.distanceNm as number, r.expected.distanceNm)).toBe(true);
      });

      it('tce computes within (wide) tolerance', async () => {
        const a = await runGolden(r, FROZEN);
        expect(a.tceUsdPerDay).not.toBeNull();
        expect(withinTolerance(a.tceUsdPerDay as number, r.expected.tcePerDay)).toBe(true);
      });

      // ---- the real oracle: engineMust gate flags ----

      // GREEN BELT — control: surfaced in the main "worth-calling" list AND profitable.
      // bucket==='main' guards against a false green where a blocked pair still yields a
      // positive fallback TCE (a control that the engine wrongly/correctly rejects must NOT pass).
      if (r.engineMust.tceSign === 'positive') {
        gate('tcePos', 'control is surfaced in main and profitable (tce > 0)', async () => {
          const a = await runGolden(r, FROZEN);
          expect(a.bucket).toBe('main');
          expect(a.tceUsdPerDay).not.toBeNull();
          expect(a.tceUsdPerDay as number).toBeGreaterThan(0);
        });
      }

      // true voyage loses money — engine must compute a negative TCE.
      if (r.engineMust.tceSign === 'negative') {
        gate('tceNeg', 'engine computes the true loss (negative TCE)', async () => {
          const a = await runGolden(r, FROZEN);
          expect(a.tceUsdPerDay as number).toBeLessThan(0);
        });
      }

      // hard gates that must BLOCK the match.
      const blockGate = r.engineMust.tradingRestrictionEnforced
        ? 'trading restriction (vessel bans the route)'
        : r.engineMust.capacityWithinDwcc
        ? 'capacity (cargo exceeds DWT/DWCC)'
        : r.engineMust.volumeFits
        ? 'cubic/stowage overflow'
        : r.engineMust.laycanFeasible
        ? 'laycan feasibility (vessel cannot present in time)'
        : r.engineMust.draftWithinPortLimit
        ? 'port draft/LOA (vessel cannot enter disch port)'
        : null;
      if (blockGate) {
        gate('block', `engine BLOCKS on ${blockGate}`, async () => {
          const a = await runGolden(r, FROZEN);
          expect(a.bucket).toBe('blocked');
        });
      }

      // spot/prompt vessel with no real position must not score as an ideal/main match.
      if (r.engineMust.spotNotIdealised) {
        gate('spot', 'engine does not idealise a spot/prompt vessel (not in main bucket)', async () => {
          const a = await runGolden(r, FROZEN);
          expect(a.bucket).not.toBe('main');
        });
      }

      // a below-OPEX / money-losing pair must not be in the main "worth-calling" list
      // (manual-review is an acceptable home for a flagged-weak pair).
      if (r.engineMust.verdictNotGood) {
        gate('verdict', 'engine keeps a below-OPEX voyage out of the main list', async () => {
          const a = await runGolden(r, FROZEN);
          expect(a.bucket).not.toBe('main');
        });
      }

      // known gap: engine has no "estimated speed" provenance flag.
      if (r.engineMust.speedMarkedEst) {
        gate('speedEst', 'engine marks default speed as est.', async () => {
          const a = await runGolden(r, FROZEN);
          expect((a as { speedSource?: string }).speedSource).toBe('estimated');
        });
      }
    });
  }
});
