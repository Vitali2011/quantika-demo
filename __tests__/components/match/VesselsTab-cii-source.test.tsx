/**
 * @jest-environment jsdom
 *
 * W6b I13: VesselsTab must pass actual vessel.ciiSource to CiiRatingBadge,
 * not hardcode "imo-public". PI2 behavioral test — renders CiiRatingBadge
 * for real (not mocked) to assert title attribute reflects actual source.
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
  emailId: 'v-src-test',
  itemIndex: 0,
  vesselName: null,
  imo: '9322180',
  flag: 'LR',
  built: 2007,
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
  restrictions: ['CII rating D 2025'],
  lastCargoes: null,
  speedLaden: null,
  speedBallast: null,
  consumption: null,
  deckCapacity: null,
  specialFeatures: [],
  ciiRating: 'D',
  verificationWarning: null,
};

describe('VesselsTab — ciiSource behavioral (PI2)', () => {
  it('CII reject card with llm-fallback ciiSource renders badge title with llm-fallback, NOT imo-public', () => {
    const vessel: ParsedVessel = { ...baseVessel, ciiSource: 'llm-fallback' };
    render(<VesselsTab vessel={vessel} />);
    const badge = screen.getByTestId('cii-rating-badge');
    const title = badge.getAttribute('title') ?? '';
    expect(title).not.toContain('imo-public');
    // llm-fallback tooltip uses "Estimated by AI" phrasing, not raw source name
    expect(title).toContain('Estimated by AI');
  });

  it('CII reject card with imo-public ciiSource renders badge title with imo-public', () => {
    const vessel: ParsedVessel = { ...baseVessel, ciiSource: 'imo-public' };
    render(<VesselsTab vessel={vessel} />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge.getAttribute('title')).toContain('imo-public');
  });

  it('CII reject card with undefined ciiSource defaults to imo-public', () => {
    // vessel without ciiSource — backward compat fallback
    const vessel: ParsedVessel = { ...baseVessel };
    render(<VesselsTab vessel={vessel} />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge.getAttribute('title')).toContain('imo-public');
  });
});
