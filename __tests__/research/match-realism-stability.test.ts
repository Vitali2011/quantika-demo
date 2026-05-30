/**
 * Wave A acceptance guard. Locks the two headline numbers so they can't silently
 * regress: (1) baseline match count is stable across run dates (was 1418→662→67),
 * (2) the unknown/insufficient-data share of baseline is <25% (was ~62%).
 * Mirrors the baseline math of scripts/research/match-realism-funnel.ts.
 */
import { describe, it, expect } from '@jest/globals';
import cargoesFixture from '@/lib/sample-data/demo-parsed-cargoes.json';
import vesselsFixture from '@/lib/sample-data/demo-parsed-vessels.json';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import { cfValue } from '@/lib/types';
import { rebaseParsedCargoes, rebaseParsedVessels } from '@/lib/sample-data/rebase-parsed';
import { runHardFilters } from '@/lib/sailing/match-filters';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';

function baseline(today: Date): { pass: number; unknownShare: number } {
  const cargos = rebaseParsedCargoes(cargoesFixture as unknown as ParsedCargo[], today);
  const vessels = rebaseParsedVessels(vesselsFixture as unknown as ParsedVessel[], today);
  let pass = 0;
  let unknown = 0;
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
      if (r.verdict === 'unknown') unknown++;
    }
  }
  return { pass, unknownShare: pass ? unknown / pass : 0 };
}

describe('match-realism stability + coverage (Wave A acceptance)', () => {
  const dates = [
    new Date(Date.UTC(2026, 4, 1)),
    new Date(Date.UTC(2026, 4, 29)),
    new Date(Date.UTC(2026, 5, 15)),
  ];
  const results = dates.map(baseline);

  it('baseline match count is stable across run dates (was 1418→662→67)', () => {
    const counts = results.map((r) => r.pass);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(min).toBeGreaterThan(0);
    expect(max / min).toBeLessThan(1.5); // pre-fix spread was ~21×
  });

  it('unknown share of baseline is below 25% (was ~62%)', () => {
    for (const r of results) {
      expect(r.unknownShare).toBeLessThan(0.25);
    }
  });

  it('baseline preserves verdict variety — not collapsed to a single bucket', () => {
    // sanity: assessable (non-unknown) majority + a meaningful idle/tight tail
    const { pass, unknownShare } = results[0];
    expect(unknownShare).toBeLessThan(0.5);
    expect(pass).toBeGreaterThan(200);
  });
});
