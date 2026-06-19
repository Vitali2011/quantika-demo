/**
 * @jest-environment jsdom
 *
 * Behavioral test — MatchWorksheet Volume row for a CBM-only cargo that overflows
 * the holds (cold-QA MEDIUM follow-up, Group B phase-2).
 *
 * Before the fix, a CBM-only cargo (no weight, volumeCbm present) whose volume
 * EXCEEDED the vessel grain capacity still showed a green "✅ OK" because the
 * volume hard-filter returned pass:true and never looked at volumeCbm. The
 * Volume row must render the WARNING surfaced by the (now volume-aware) filter
 * instead of a green OK — while a cargo that fits keeps its clean verdict.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MatchWorksheet } from '../MatchWorksheet';
import type { MatchWorksheet as MatchWorksheetType } from '@/lib/types';

function makeWorksheet(
  cargo: Partial<MatchWorksheetType['cargo']>,
  volume: MatchWorksheetType['hardFilters']['volume'],
): MatchWorksheetType {
  return {
    readiness: {
      verdict: 'ideal', explanation: '', openDate: null, openPosition: null,
      laycanStart: null, laycanEnd: null, distanceNm: null, sailingDays: null,
      speedKn: null, arrivalDate: null, gapDays: null,
    },
    vessel: {
      draftMax: null, grainCapacity: 13000, grainCapacityUnit: null, geared: null,
      vesselType: null, flag: null, built: null, pandi: null, classSociety: null,
      lastCargoes: null, dwtSummer: 10000, dwcc: null,
    },
    cargo: {
      weightMt: null, cargoType: null, loadPort: null, dischargePort: null,
      ...cargo,
    },
    hardFilters: {
      draft: { pass: true }, crane: { pass: true }, volume,
    },
  };
}

describe('MatchWorksheet — CBM-only volume overflow', () => {
  it('does NOT show a green OK on Volume when CBM overflows the holds — shows ⚠️ warning', () => {
    render(
      <MatchWorksheet
        worksheet={makeWorksheet(
          { weightMt: null, weightMtEffective: null, volumeCbm: 15000 },
          { pass: true, warning: true, reason: 'cargo volume 15000m³ exceeds vessel grain capacity 13000m³' },
        )}
      />,
    );
    const row = screen.getByTestId('worksheet-volume-row');
    expect(row).toHaveTextContent('⚠️');
    expect(row).not.toHaveTextContent('✅');
    expect(row).not.toHaveTextContent(/✅\s*OK/);
    expect(row).toHaveTextContent(/15,000\s*cbm/i);
  });

  it('still shows ✅ OK on Volume when CBM fits within capacity (no regression)', () => {
    render(
      <MatchWorksheet
        worksheet={makeWorksheet(
          { weightMt: null, weightMtEffective: null, volumeCbm: 12000 },
          { pass: true },
        )}
      />,
    );
    const row = screen.getByTestId('worksheet-volume-row');
    expect(row).toHaveTextContent('✅');
    expect(row).not.toHaveTextContent('⚠️');
  });
});
