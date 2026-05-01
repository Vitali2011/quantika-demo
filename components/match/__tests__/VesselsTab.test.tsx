/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VesselsTab } from '../VesselsTab';
import type { ParsedVessel } from '@/lib/types';

const baseVessel: ParsedVessel = {
  emailId: 'v-1',
  itemIndex: 0,
  vesselName: { value: 'MV TEST', confidence: 'confirmed', sourceText: 'MV TEST' },
  imo: '9322180',
  flag: 'LR',
  built: 2007,
  classSociety: null,
  pandi: null,
  dwtSummer: { value: 28500, confidence: 'confirmed', sourceText: '28500' },
  dwcc: null,
  draftMax: null,
  loa: null,
  beam: null,
  grt: null,
  nrt: null,
  holdsCount: 5,
  hatchesCount: null,
  grainCapacity: null,
  grainCapacityUnit: null,
  baleCapacity: null,
  holdDimensions: null,
  hatchDimensions: null,
  tankTopStrength: null,
  geared: true,
  craneCapacity: null,
  hatchType: null,
  vesselType: 'handysize bulker',
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

describe('VesselsTab — normal render', () => {
  it('shows vessel IMO and type for A/B/C rated vessel', () => {
    const vessel: ParsedVessel = { ...baseVessel, restrictions: ['CII rating C 2025'] };
    render(<VesselsTab vessel={vessel} />);
    expect(screen.getByTestId('tab-vessels')).toBeInTheDocument();
    expect(screen.queryByTestId('cii-reject-card')).not.toBeInTheDocument();
  });

  it('shows normal card when no CII restriction', () => {
    render(<VesselsTab vessel={baseVessel} />);
    expect(screen.queryByTestId('cii-reject-card')).not.toBeInTheDocument();
  });
});

describe('VesselsTab — CII D/E reject card', () => {
  it('shows reject card when vessel has CII rating D in restrictions', () => {
    const vessel: ParsedVessel = {
      ...baseVessel,
      restrictions: ['CII rating D 2025 (carbon intensity above IMO threshold)'],
    };
    render(<VesselsTab vessel={vessel} />);
    expect(screen.getByTestId('cii-reject-card')).toBeInTheDocument();
    expect(screen.getByTestId('cii-reject-card')).toHaveTextContent(
      'CII rating D/E exceeds chartering policy threshold',
    );
  });

  it('shows reject card when vessel has CII rating E in restrictions', () => {
    const vessel: ParsedVessel = {
      ...baseVessel,
      restrictions: ['CII rating E 2025'],
    };
    render(<VesselsTab vessel={vessel} />);
    expect(screen.getByTestId('cii-reject-card')).toBeInTheDocument();
  });

  it('reject card contains expandable "Show rejected details" section', () => {
    const vessel: ParsedVessel = {
      ...baseVessel,
      restrictions: ['CII rating D 2025'],
    };
    render(<VesselsTab vessel={vessel} />);
    expect(screen.getByText(/show rejected details/i)).toBeInTheDocument();
  });
});
