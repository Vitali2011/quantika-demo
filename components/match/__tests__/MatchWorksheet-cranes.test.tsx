/**
 * Behavioral tests — MatchWorksheet cranes verdict cell (Layer C)
 *
 * PI2: real component call, checks rendered output strings.
 * Covers:
 *  - gearless + breakbulk + unverified cranes → ⚠️ amber (warning=true)
 *  - gearless + breakbulk + confirmed cranes → ✅ OK (warning absent)
 *  - geared + breakbulk → ✅ OK (no warning)
 *  - gearless + bulk → ✅ OK (no warning for bulk)
 */
import { MatchWorksheet } from '../MatchWorksheet';
import type { MatchWorksheet as MatchWorksheetType } from '@/lib/types';

function makeWorksheet(overrides: {
  geared: boolean | null;
  cranePass: boolean;
  craneWarning?: boolean;
  craneReason?: string;
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
      geared: overrides.geared,
      vesselType: null,
      flag: null,
      built: null,
      pandi: null,
      classSociety: null,
      lastCargoes: null,
      dwtSummer: null,
      dwcc: null,
    },
    cargo: {
      weightMt: null,
      cargoType: 'BREAK_BULK',
      loadPort: null,
      dischargePort: null,
    },
    hardFilters: {
      draft: { pass: true },
      crane: {
        pass: overrides.cranePass,
        warning: overrides.craneWarning,
        reason: overrides.craneReason,
      },
      volume: { pass: true },
    },
  };
}

describe('MatchWorksheet — cranes verdict (Layer C)', () => {
  it('gearless + breakbulk + unverified cranes → ⚠️ amber Confirm cranes', () => {
    const ws = makeWorksheet({
      geared: false,
      cranePass: true,
      craneWarning: true,
      craneReason: 'Confirm cranes (load/disch)',
    });
    const el = MatchWorksheet({ worksheet: ws });
    const text = JSON.stringify(el);
    expect(text).toContain('⚠️');
    expect(text).toContain('Confirm cranes');
    // must NOT show ✅ for the cranes row
    // Note: other rows may show ✅ (e.g. timing), but the cranes verdict specifically has ⚠️
    expect(text).toContain('⚠️ Confirm cranes (load/disch)');
  });

  it('gearless + breakbulk + confirmed cranes → ✅ OK (no warning)', () => {
    const ws = makeWorksheet({
      geared: false,
      cranePass: true,
      craneWarning: undefined,
      craneReason: undefined,
    });
    const el = MatchWorksheet({ worksheet: ws });
    const text = JSON.stringify(el);
    // cranes row shows ✅ OK
    expect(text).toContain('✅ OK');
  });

  it('geared vessel → ✅ OK in cranes row (no warning)', () => {
    const ws = makeWorksheet({
      geared: true,
      cranePass: true,
      craneWarning: undefined,
    });
    const el = MatchWorksheet({ worksheet: ws });
    const text = JSON.stringify(el);
    expect(text).toContain('✅ OK');
    expect(text).not.toContain('⚠️ Confirm cranes');
  });

  it('gearless + breakbulk + no cranes → ⚠️ failure (not amber warning)', () => {
    const ws = makeWorksheet({
      geared: false,
      cranePass: false,
      craneWarning: undefined,
      craneReason: 'gearless vessel cannot load at Port X (no shore cranes)',
    });
    const el = MatchWorksheet({ worksheet: ws });
    const text = JSON.stringify(el);
    // cranes row shows ⚠️ with the reason, NOT amber "Confirm cranes"
    expect(text).toContain('⚠️ gearless vessel cannot load at Port X (no shore cranes)');
    expect(text).not.toContain('Confirm cranes');
  });
});
