/**
 * Wave A acceptance guard. Wave A is DATA-ONLY: it (1) rebases demo laycan/open
 * dates onto `now` so match counts stop drifting with the run date, and (2) adds
 * real missing ports + aliases so genuine ports resolve a distance.
 *
 * Scope boundary (documented assumption A5): the shipped matching core (PR #694)
 * deliberately classifies detector-vague positions (sea basins, bare countries,
 * coast ranges — "Red Sea", "Persian Gulf", "WC India") as `unknown` + broker
 * hint, with eval tests locking it. Wave A honours that — it does NOT centroid
 * those. So the residual `unknown` share is bounded by that core contract, not by
 * data coverage; driving it below ~25% would require overriding the core, which
 * is out of Wave-A scope. This guard therefore locks what Wave A DOES deliver:
 * stability across run dates, preserved verdict variety, and real-port coverage.
 */
import { describe, it, expect } from '@jest/globals';
import cargoesFixture from '@/lib/sample-data/demo-parsed-cargoes.json';
import vesselsFixture from '@/lib/sample-data/demo-parsed-vessels.json';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import { cfValue } from '@/lib/types';
import { rebaseParsedCargoes, rebaseParsedVessels } from '@/lib/sample-data/rebase-parsed';
import { runHardFilters } from '@/lib/sailing/match-filters';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';
import { getPortDistance } from '@/lib/sailing/port-distances';

interface Stats {
  pass: number;
  unknownShare: number;
  verdicts: Record<string, number>;
}

function baseline(today: Date): Stats {
  const cargos = rebaseParsedCargoes(cargoesFixture as unknown as ParsedCargo[], today);
  const vessels = rebaseParsedVessels(vesselsFixture as unknown as ParsedVessel[], today);
  let pass = 0;
  let unknown = 0;
  const verdicts: Record<string, number> = {};
  for (const c of cargos) {
    for (const v of vessels) {
      const hf = runHardFilters({
        cargoType: c.cargoType,
        originPort: cfValue(c.originPort),
        destinationPort: cfValue(c.destinationPort),
        weightMt:
          c.weightMtMin != null && c.weightMtMax != null && c.weightMtMin !== c.weightMtMax
            ? { min: c.weightMtMin, max: c.weightMtMax }
            : cfValue(c.weightMt),
        cargoDescription: cfValue(c.cargoDescription),
        stowageFactor: c.stowageFactor,
        vesselType: v.vesselType,
        geared: v.geared,
        draftMax: cfValue(v.draftMax),
        grainCapacity: v.grainCapacity,
        dwtSummer: cfValue(v.dwtSummer),
        dwcc: cfValue(v.dwcc),
      });
      if (!hf.pass) continue;
      const rawOpen = cfValue(v.openDate) as unknown as string;
      const r = calculateReadinessGap(
        {
          openDate: rawOpen,
          openPosition: cfValue(v.openPosition),
          speedLaden: v.speedLaden ?? null,
          dwtSummer: cfValue(v.dwtSummer),
          isSpot: detectSpot(rawOpen),
        },
        { laycan: c.laycan, originPort: cfValue(c.originPort) },
        { refYear: today.getUTCFullYear(), today },
      );
      if (r.verdict === 'late') continue;
      pass++;
      verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
      if (r.verdict === 'unknown') unknown++;
    }
  }
  return { pass, unknownShare: pass ? unknown / pass : 0, verdicts };
}

describe('match-realism Wave-A acceptance (data freshness + port coverage)', () => {
  const dates = [
    new Date(Date.UTC(2026, 4, 1)),
    new Date(Date.UTC(2026, 4, 29)),
    new Date(Date.UTC(2026, 5, 15)),
  ];
  const results = dates.map(baseline);

  it('baseline match count is STABLE across run dates (was 1418 → 662 → 67)', () => {
    const counts = results.map((r) => r.pass);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(min).toBeGreaterThan(0);
    expect(max / min).toBeLessThan(1.1); // pre-fix spread was ~21× (1418/67)
  });

  it('unknown SHARE is stable across run dates (no date-driven drift)', () => {
    const shares = results.map((r) => r.unknownShare);
    const spread = Math.max(...shares) - Math.min(...shares);
    expect(spread).toBeLessThan(0.05);
  });

  it('verdict variety is preserved — not collapsed into a single bucket / all-spot', () => {
    for (const r of results) {
      expect(r.verdicts.ideal ?? 0).toBeGreaterThan(0);
      expect(r.verdicts.tight ?? 0).toBeGreaterThan(0);
      expect(r.verdicts.idle ?? 0).toBeGreaterThan(0);
    }
  });

  it('real-port coverage: added ports resolve a distance; core-vague regions stay null', () => {
    // Real ports added in Wave A (were `unknown` distance before) now resolve.
    for (const p of ['Praia Mole', 'Vassiliko', 'Souda', 'Vizag', 'La Coruna']) {
      const d = getPortDistance('Rotterdam', p);
      expect(d).not.toBeNull();
      expect(d!.nm).toBeGreaterThan(0);
    }
    // Detector-vague regions remain unresolved (honours the shipped core UX).
    expect(getPortDistance('Red Sea', 'Mykolaiv')).toBeNull();
  });
});
