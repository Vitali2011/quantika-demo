/**
 * Engine/regen intake: CBFT→CBM conversion of vessels BEFORE they reach the
 * matching engine's volume readers (checkVolume / scoreVolume).
 *
 * ROOT (#984 follow-up): #984 converted cbft→cbm only at parse-time (new LLM
 * parses) and at hydrate (LIVE display). The matching ENGINE / regen path was a
 * THIRD reader — it loads cached raw cbft from parsed_results and fed the RAW
 * value straight to checkVolume/scoreVolume, which read grainCapacity as m³. So
 * a 220577 cbft vessel was treated as ~220577 m³ (~35× inflated) and the volume
 * gate never bound.
 *
 * FIX: normalizeVesselCapacityToCbm (shared single-owner util) runs at engine/
 * regen intake. Oracle: 220577 cbft → 6247 cbm. A vessel already cbm (3994) must
 * stay 3994 (no double-convert).
 *
 * Behavioral: feeds the normalized capacity through the REAL checkVolume and
 * scoreVolume — not a string assertion.
 */
import {
  normalizeVesselCapacityToCbm,
  CBFT_TO_CBM,
} from '@/lib/parsing/vessel-capacity-units';
import { checkVolume } from '@/lib/sailing/match-filters';
import { scoreVolume } from '@/lib/sailing/fit-breakdown';
import type { ParsedVessel } from '@/lib/types';

function makeVessel(over: Partial<ParsedVessel>): ParsedVessel {
  return {
    emailId: 'v', itemIndex: 0,
    vesselName: null, imo: null, flag: null, built: null, classSociety: null, pandi: null,
    dwtSummer: null, dwcc: null, draftMax: null, loa: null, beam: null, grt: null, nrt: null,
    holdsCount: null, hatchesCount: null,
    grainCapacity: null, grainCapacityUnit: null, baleCapacity: null,
    holdDimensions: null, hatchDimensions: null, tankTopStrength: null, geared: null,
    craneCapacity: null, hatchType: null, vesselType: null, openPosition: null, openDate: null,
    direction: null, restrictions: [], lastCargoes: null, speedLaden: null, speedBallast: null,
    consumption: null, deckCapacity: null, specialFeatures: [], ciiRating: null,
    verificationWarning: null,
    ...over,
  } as ParsedVessel;
}

describe('engine intake converts cbft grain capacity before the volume readers', () => {
  it('220577 cbft → ~6247 cbm at intake (oracle)', () => {
    const v = makeVessel({ grainCapacity: 220577, grainCapacityUnit: 'cbft' });
    normalizeVesselCapacityToCbm(v);
    expect(v.grainCapacityUnit).toBe('cbm');
    expect(v.grainCapacity!).toBeGreaterThanOrEqual(6240);
    expect(v.grainCapacity!).toBeLessThanOrEqual(6250);
    // sanity vs the documented factor
    expect(v.grainCapacity).toBe(Math.round(220577 / CBFT_TO_CBM));
  });

  it('checkVolume BINDS on a real overflow once cbft is converted (gate would never bind on raw cbft)', () => {
    // 6000 mt grain (sf 1.35 → ~8100 m³ required) vs a 6247 m³ hold → overflow.
    const v = makeVessel({ grainCapacity: 220577, grainCapacityUnit: 'cbft' });
    normalizeVesselCapacityToCbm(v);

    const fail = checkVolume({
      weightMt: 6000,
      grainCapacity: v.grainCapacity,
      cargoDescription: 'grain',
      stowageFactor: null,
    });
    expect(fail.pass).toBe(false);

    // Against the RAW (unconverted) cbft the same cargo trivially "fits" — proving
    // the bug: the gate never binds when grainCapacity is read as 220577 m³.
    const rawPass = checkVolume({
      weightMt: 6000,
      grainCapacity: 220577,
      cargoDescription: 'grain',
      stowageFactor: null,
    });
    expect(rawPass.pass).toBe(true);
  });

  it('scoreVolume sees ~6247 m³ not 220577 (ratio reflects the real hold)', () => {
    const v = makeVessel({ grainCapacity: 220577, grainCapacityUnit: 'cbft' });
    normalizeVesselCapacityToCbm(v);

    // 4000 mt grain × 1.35 sf = 5400 m³ required vs 6247 m³ hold → ~86% → ideal fill.
    const converted = scoreVolume(4000, 'grain', v.grainCapacity, null);
    expect(converted.bracketData).toBe('86% of grain');

    // Same cargo against raw cbft reads as ~2% — the inflated-capacity bug.
    const raw = scoreVolume(4000, 'grain', 220577, null);
    expect(raw.bracketData).toBe('2% of grain');
  });

  it('a vessel already cbm (3994) stays 3994 — no double-convert', () => {
    const v = makeVessel({ grainCapacity: 3994, grainCapacityUnit: 'cbm' });
    normalizeVesselCapacityToCbm(v);
    expect(v.grainCapacity).toBe(3994);
    expect(v.grainCapacityUnit).toBe('cbm');
  });

  it('is idempotent — a second pass after conversion does not re-divide', () => {
    const v = makeVessel({ grainCapacity: 220577, grainCapacityUnit: 'cbft', baleCapacity: 210000 });
    normalizeVesselCapacityToCbm(v);
    const grainAfterFirst = v.grainCapacity;
    const baleAfterFirst = v.baleCapacity;
    normalizeVesselCapacityToCbm(v);
    expect(v.grainCapacity).toBe(grainAfterFirst);
    expect(v.baleCapacity).toBe(baleAfterFirst);
  });

  it('converts bale capacity under the shared grain unit (no separate bale unit)', () => {
    const v = makeVessel({ grainCapacity: 220577, grainCapacityUnit: 'cbft', baleCapacity: 210000 });
    normalizeVesselCapacityToCbm(v);
    expect(v.baleCapacity).toBe(Math.round(210000 / CBFT_TO_CBM));
  });
});
