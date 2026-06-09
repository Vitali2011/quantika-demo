/**
 * @jest-environment jsdom
 *
 * #884: VesselsTab bale capacity label must read grainCapacityUnit from vessel,
 * not hardcode "CBM". PI2 behavioral render test.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VesselsTab } from '@/components/match/VesselsTab';
import type { ParsedVessel } from '@/lib/types';

jest.mock('@/lib/cargo/l5c-matrix', () => ({
  checkCompatibility: jest.fn().mockReturnValue(null),
  parseLastCargoes: jest.fn().mockReturnValue([]),
}));

const baseVessel: ParsedVessel = {
  emailId: 'v-cap-unit-test',
  itemIndex: 0,
  vesselName: null,
  imo: '9367841',
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
  ciiRating: null,
  verificationWarning: null,
};

describe('#884 — VesselsTab bale capacity unit label', () => {
  it('renders bale capacity with "CBM" when grainCapacityUnit is "cbm"', () => {
    const vessel: ParsedVessel = { ...baseVessel, baleCapacity: 3994, grainCapacityUnit: 'cbm' };
    render(<VesselsTab vessel={vessel} />);
    expect(screen.getByText(/3,994/)).toBeInTheDocument();
    expect(screen.getByText(/3,994/).textContent).toContain('CBM');
  });

  it('#884: renders bale capacity with "CBFT" when grainCapacityUnit is "cbft" — fails with hardcoded CBM', () => {
    const vessel: ParsedVessel = { ...baseVessel, baleCapacity: 3994, grainCapacityUnit: 'cbft' };
    render(<VesselsTab vessel={vessel} />);
    // This test verifies the unit is dynamic — with "cbft" unit it must NOT show "CBM"
    const capacityText = screen.getByText(/3,994/).textContent ?? '';
    expect(capacityText).toContain('CBFT');
    expect(capacityText).not.toContain('CBM');
  });

  it('renders bale capacity with "CBM" fallback when grainCapacityUnit is null', () => {
    const vessel: ParsedVessel = { ...baseVessel, baleCapacity: 3994, grainCapacityUnit: null };
    render(<VesselsTab vessel={vessel} />);
    expect(screen.getByText(/3,994/).textContent).toContain('CBM');
  });
});
