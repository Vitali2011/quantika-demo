/**
 * Behavioral tests — MatchWorksheet weight util% (Layer D green-lie fix)
 *
 * PI2: real component call via direct render, checks util% verdict string.
 * Covers:
 *  - weightMtEffective present → uses worst-case → overflow ❌
 *  - weightMtEffective absent → graceful fallback to nominal → OK ✅
 */
import { MatchWorksheet } from '../MatchWorksheet';
import type { MatchWorksheet as MatchWorksheetType } from '@/lib/types';

function makeWeightWorksheet(overrides: {
  weightMt: number | null;
  weightMtEffective?: number | null;
  dwcc?: number | null;
  dwtSummer?: number | null;
}): MatchWorksheetType {
  return {
    readiness: {
      verdict: 'ideal',
      explanation: '',
      openDate: null,
      openPosition: null,
      laycanStart: null,
      laycanEnd: null,
      distanceNm: null,
      sailingDays: null,
      speedKn: null,
      arrivalDate: null,
      gapDays: null,
    },
    vessel: {
      draftMax: null,
      grainCapacity: null,
      grainCapacityUnit: null,
      geared: null,
      vesselType: null,
      flag: null,
      built: null,
      pandi: null,
      classSociety: null,
      lastCargoes: null,
      dwtSummer: overrides.dwtSummer ?? null,
      dwcc: overrides.dwcc ?? null,
    },
    cargo: {
      weightMt: overrides.weightMt,
      weightMtEffective: overrides.weightMtEffective,
      cargoType: null,
      loadPort: null,
      dischargePort: null,
    },
    hardFilters: {
      draft: { pass: true },
      crane: { pass: true },
      volume: { pass: true },
    },
  };
}

describe('MatchWorksheet — weight util% (Layer D)', () => {
  it('Berbera-like: weightMtEffective=3080, dwcc=2962 → overflow (>100%) ❌', () => {
    const ws = makeWeightWorksheet({
      weightMt: 2800,
      weightMtEffective: 3080,
      dwcc: 2962,
    });
    const el = MatchWorksheet({ worksheet: ws });
    const text = JSON.stringify(el);
    // util = round(3080/2962*100) = round(104.0) = 104% → overflow
    expect(text).toMatch(/104%/);
    // must NOT show ✅ for weight (overflow should show ❌ or no checkmark)
    expect(text).not.toContain('104% utilisation ✅');
  });

  it('weightMtEffective absent → graceful fallback to nominal (no crash)', () => {
    const ws = makeWeightWorksheet({
      weightMt: 2800,
      weightMtEffective: undefined,
      dwcc: 2962,
    });
    const el = MatchWorksheet({ worksheet: ws });
    const text = JSON.stringify(el);
    // util = round(2800/2962*100) = round(94.5) = 95% → OK (≥85%)
    expect(text).toMatch(/95%/);
    expect(text).toContain('utilisation ✅');
  });
});
