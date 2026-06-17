/**
 * @jest-environment jsdom
 *
 * Behavioral tests — MatchWorksheet honest residue (#1022, founder decision).
 * When cargo weight/volume is TRULY absent, the worksheet must NOT render a
 * false "✅ OK" verdict; it shows an honest "not verified" flag instead. The
 * card STAYS in the Main List (no bucket change here).
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MatchWorksheet } from '../MatchWorksheet';
import type { MatchWorksheet as MatchWorksheetType } from '@/lib/types';

function makeWorksheet(cargo: Partial<MatchWorksheetType['cargo']>): MatchWorksheetType {
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
      draft: { pass: true }, crane: { pass: true }, volume: { pass: true },
    },
  };
}

describe('MatchWorksheet — honest residue (#1022)', () => {
  it('does NOT show ✅ OK on Weight when cargo weight is truly unknown', () => {
    render(<MatchWorksheet worksheet={makeWorksheet({ weightMt: null, weightMtEffective: null })} />);
    const row = screen.getByTestId('worksheet-weight-row');
    expect(row).not.toHaveTextContent('OK');
    expect(row).toHaveTextContent(/not verified/i);
  });

  it('does NOT show ✅ OK on Volume when neither weight nor volumeCbm stated', () => {
    render(<MatchWorksheet worksheet={makeWorksheet({ weightMt: null, weightMtEffective: null, volumeCbm: null })} />);
    const row = screen.getByTestId('worksheet-volume-row');
    expect(row).not.toHaveTextContent('OK');
    expect(row).toHaveTextContent(/not verified/i);
  });

  it('shows recovered volumeCbm in the Volume row when present', () => {
    render(<MatchWorksheet worksheet={makeWorksheet({ weightMt: null, weightMtEffective: null, volumeCbm: 12000 })} />);
    const row = screen.getByTestId('worksheet-volume-row');
    expect(row).toHaveTextContent(/12,000\s*cbm/i);
    expect(row).not.toHaveTextContent(/not verified/i);
  });
});
