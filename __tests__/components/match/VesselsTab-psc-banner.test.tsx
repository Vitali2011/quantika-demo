/**
 * @jest-environment jsdom
 *
 * W6b I13: VesselsTab vetting section must show "Demo data" banner for PSC
 * (psc/fixture.ts synthetic) and "Illustrative demo data" for charterers
 * (seed-charterers fictional), so users are not misled by the vetting scores.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VesselsTab } from '@/components/match/VesselsTab';
import type { ParsedVessel } from '@/lib/types';

jest.mock('@/components/vessel/CiiRatingBadge', () => ({
  CiiRatingBadge: () => null,
}));

jest.mock('@/lib/cargo/l5c-matrix', () => ({
  checkCompatibility: jest.fn().mockReturnValue(null),
  parseLastCargoes: jest.fn().mockReturnValue([]),
}));

const baseVessel: ParsedVessel = {
  emailId: 'v-psc-banner',
  itemIndex: 0,
  vesselName: null,
  imo: null,
  flag: null,
  built: null,
  classSociety: null,
  pandi: null,
  dwtSummer: null,
  dwcc: null,
  draftMax: null,
  loa: null,
  beam: null,
  grt: null,
  nrt: null,
  holdsCount: null,
  hatchesCount: null,
  grainCapacity: null,
  grainCapacityUnit: null,
  baleCapacity: null,
  holdDimensions: null,
  hatchDimensions: null,
  tankTopStrength: null,
  geared: null,
  craneCapacity: null,
  hatchType: null,
  vesselType: null,
  openPosition: null,
  openDate: null,
  direction: null,
  restrictions: [],
  lastCargoes: null,
  speedLaden: null,
  speedBallast: null,
  consumption: null,
  deckCapacity: null,
  specialFeatures: [],
  verificationWarning: null,
};

describe('VesselsTab — vetting demo banners (I13)', () => {
  it('shows PSC demo data banner on normal card (no CII rejection)', () => {
    render(<VesselsTab vessel={baseVessel} />);
    expect(screen.getByTestId('psc-demo-badge')).toBeInTheDocument();
    expect(screen.getByTestId('psc-demo-badge')).toHaveTextContent(/demo data/i);
  });

  it('shows charterers illustrative demo data banner', () => {
    render(<VesselsTab vessel={baseVessel} />);
    expect(screen.getByTestId('charterers-demo-badge')).toBeInTheDocument();
    expect(screen.getByTestId('charterers-demo-badge')).toHaveTextContent(/illustrative/i);
  });

  it('shows PSC demo banner even when vessel has CII D rejection card', () => {
    const vessel: ParsedVessel = { ...baseVessel, restrictions: ['CII rating D 2025'] };
    render(<VesselsTab vessel={vessel} />);
    expect(screen.getByTestId('psc-demo-badge')).toBeInTheDocument();
  });

  it('shows PSC demo banner when no vessel provided', () => {
    render(<VesselsTab />);
    expect(screen.getByTestId('psc-demo-badge')).toBeInTheDocument();
  });
});
