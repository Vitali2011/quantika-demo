/**
 * @jest-environment jsdom
 */
/**
 * Regression: RC-fueleu-flag
 * Guard: NEXT_PUBLIC_FUELEU_ENABLED controls client-side FuelEU tile visibility.
 * When the flag is NOT 'true', the fueleu-tile must NOT appear in the DOM.
 *
 * EconomicsTab reads process.env.NEXT_PUBLIC_FUELEU_ENABLED inline (line 93),
 * so mutating process.env before render() is sufficient — no resetModules needed.
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EconomicsTab } from '@/components/match/EconomicsTab';

// Mock heavy dependencies
jest.mock('@/components/economics/RouteCompareModal', () => ({
  RouteCompareModal: () => null,
}));
jest.mock('@/lib/economics/fueleu', () => ({
  calculateFuelEu: jest.fn(() => ({
    ghgIntensityActual: 91.0,
    ghgIntensityTarget: 89.0,
    complianceFactor: 1.02,
    deficit: 1000,
    penaltyEur: 2400000,
    penaltyUsd: 2616000,
    badge: 'non-compliant',
  })),
}));

describe('RC-fueleu-flag — NEXT_PUBLIC_FUELEU_ENABLED gate', () => {
  const originalValue = process.env.NEXT_PUBLIC_FUELEU_ENABLED;

  afterEach(() => {
    // restore original value
    if (originalValue === undefined) {
      delete process.env.NEXT_PUBLIC_FUELEU_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_FUELEU_ENABLED = originalValue;
    }
  });

  it('fueleu-tile is absent when NEXT_PUBLIC_FUELEU_ENABLED is not set', () => {
    delete process.env.NEXT_PUBLIC_FUELEU_ENABLED;
    const { queryByTestId } = render(<EconomicsTab />);
    expect(queryByTestId('fueleu-tile')).toBeNull();
  });

  it('fueleu-tile is absent when NEXT_PUBLIC_FUELEU_ENABLED=false', () => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'false';
    const { queryByTestId } = render(<EconomicsTab />);
    expect(queryByTestId('fueleu-tile')).toBeNull();
  });

  it('fueleu-tile is present when NEXT_PUBLIC_FUELEU_ENABLED=true', () => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'true';
    const { queryByTestId } = render(<EconomicsTab />);
    expect(queryByTestId('fueleu-tile')).not.toBeNull();
  });
});
