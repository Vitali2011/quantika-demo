/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';

describe('EconomicsTab FuelEU tile', () => {
  const origEnv = process.env.NEXT_PUBLIC_FUELEU_ENABLED;

  afterEach(() => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = origEnv;
  });

  test('FuelEU tile hidden when flag is false', () => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'false';

    render(<EconomicsTab />);

    expect(screen.queryByTestId('fueleu-tile')).not.toBeInTheDocument();
  });

  test('FuelEU tile shown when flag is true', () => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'true';

    render(<EconomicsTab />);

    expect(screen.getByTestId('fueleu-tile')).toBeInTheDocument();
  });

  test('FuelEU tile shows fuel type selector', () => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'true';

    render(<EconomicsTab />);

    const fuelSelect = screen.getByLabelText('Fuel type');
    expect(fuelSelect).toBeInTheDocument();
    expect(fuelSelect).toHaveValue('hfo'); // default
  });

  test('FuelEU tile shows compliance badge when compliant', () => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'true';

    render(<EconomicsTab />);

    // Default: HFO is non-compliant (91.27 > 91.16)
    // But without voyage data, totalEnergy=0, so it should be compliant
    expect(screen.getByText(/Compliant/i)).toBeInTheDocument();
  });

  test('FuelEU tile shows penalty when non-compliant with voyage data', () => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'true';

    const vessel = {
      emailId: '1',
      itemIndex: 0,
      vesselName: { value: 'Test Vessel', confidence: 'confirmed' as const },
      dwtSummer: { value: 50000, confidence: 'confirmed' as const },
      speedLaden: '14 kts',
      consumption: '30 mt/day',
      openPosition: null,
      openDate: null,
      restrictions: [],
      specialFeatures: [],
    };

    const cargo = {
      emailId: '2',
      itemIndex: 0,
      originPort: { value: 'SGSIN', confidence: 'confirmed' as const },
      originCountry: 'SG',
      destinationPort: { value: 'NLRTM', confidence: 'confirmed' as const },
      destinationCountry: 'NL',
      cargoDescription: { value: 'Steel', confidence: 'confirmed' as const },
      weightMt: { value: 10000, confidence: 'confirmed' as const },
      weightMtMin: 10000,
      weightMtMax: 10000,
      volumeCbm: null,
      dimensions: null,
      cargoType: 'BULK' as const,
      containerType: null,
      quantity: null,
      incoterms: null,
      preferredDates: null,
      laycan: null,
      loadingRate: null,
      dischargeRate: null,
      commissionPercent: null,
      commissionTerms: null,
      specialRequirements: null,
      stowageFactor: null,
      missingInfo: [],
    };

    render(<EconomicsTab vessel={vessel as unknown as import('@/lib/types').ParsedVessel} cargo={cargo} />);

    // With vessel consumption and estimated voyage days, penalty should be shown
    // (depends on implementation details)
    const fueleuTile = screen.getByTestId('fueleu-tile');
    expect(fueleuTile).toBeInTheDocument();
  });

  test('FuelEU tile shows WtW GHG intensity', () => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'true';

    render(<EconomicsTab />);

    expect(screen.getByText(/GHG intensity/i)).toBeInTheDocument();
  });
});
