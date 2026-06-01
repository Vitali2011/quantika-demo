/**
 * @jest-environment jsdom
 *
 * Regression: «a.match is not a function» when restrictions contains non-strings
 * (objects/numbers from LLM parser). VesselsTab must not throw and must render
 * only string entries.
 *
 * Hotfix: fix(match): guard non-string restrictions — PR #hotfix
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

function makeVessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'test-email-id',
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
    ciiRating: null,
    verificationWarning: null,
    ...overrides,
  };
}

describe('VesselsTab — non-string restrictions guard', () => {
  it('does not throw when restrictions contains objects and numbers', () => {
    const vessel = makeVessel({
      restrictions: [{ x: 1 }, 123, 'no grain'] as unknown as string[],
    });
    expect(() => render(<VesselsTab vessel={vessel} />)).not.toThrow();
  });

  it('does not throw with mixed object/number/string restrictions (normal card path)', () => {
    const vessel = makeVessel({
      restrictions: [{ x: 1 }, 123, 'no grain', true, 'bulk only'] as unknown as string[],
    });
    expect(() => render(<VesselsTab vessel={vessel} />)).not.toThrow();
  });

  it('does not render objects as React children (no "Objects are not valid" error)', () => {
    const vessel = makeVessel({
      restrictions: [{ label: 'bad' }, 42, 'ok string'] as unknown as string[],
    });
    expect(() => render(<VesselsTab vessel={vessel} />)).not.toThrow();
  });

  it('renders without throw when all restrictions are strings', () => {
    const vessel = makeVessel({
      restrictions: ['no grain', 'max DWT 60000'],
    });
    expect(() => render(<VesselsTab vessel={vessel} />)).not.toThrow();
  });

  it('parseCiiDorE: skips non-string entries, still detects CII D/E from string entry', () => {
    const vessel = makeVessel({
      restrictions: [{ x: 1 }, 99, 'CII rating D — rejected', 'no grain'] as unknown as string[],
    });
    render(<VesselsTab vessel={vessel} />);
    expect(screen.getByTestId('cii-reject-card')).toBeInTheDocument();
  });
});
