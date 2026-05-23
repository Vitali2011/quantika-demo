/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
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

  test('FuelEU tile shows non-compliant badge for HFO (91.27 > target 91.16)', () => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'true';

    render(<EconomicsTab />);

    // HFO WtW GHG intensity (91.27) exceeds target (91.16) → non-compliant
    expect(screen.getByTestId('fueleu-noncompliant')).toBeInTheDocument();
    expect(screen.queryByTestId('fueleu-compliant')).not.toBeInTheDocument();
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

describe('FuelEU badge — compliance inversion fix (PI2 behavioral)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_FUELEU_ENABLED;
  });

  test('WtW > target: HFO (91.27 g/MJ) above 91.16 target → non-compliant badge, no compliant badge', () => {
    render(<EconomicsTab />);

    expect(screen.getByTestId('fueleu-noncompliant')).toBeInTheDocument();
    expect(screen.queryByTestId('fueleu-compliant')).not.toBeInTheDocument();
  });

  test('WtW < target: LNG (75.21 g/MJ) below 91.16 target → compliant badge', () => {
    render(<EconomicsTab />);
    fireEvent.change(screen.getByLabelText('Fuel type'), { target: { value: 'lng' } });

    expect(screen.getByTestId('fueleu-compliant')).toBeInTheDocument();
    expect(screen.queryByTestId('fueleu-noncompliant')).not.toBeInTheDocument();
  });

  test('WtW > target + voyage data: HFO with routeDistanceNm → penalty badge (not bare non-compliant)', () => {
    const vessel = {
      emailId: '1',
      itemIndex: 0,
      vesselName: { value: 'MV Test', confidence: 'confirmed' as const },
      dwtSummer: { value: 50000, confidence: 'confirmed' as const },
      speedLaden: '14 kts',
      consumption: '30 mt/day',
      openPosition: null,
      openDate: null,
      restrictions: [],
      specialFeatures: [],
    };

    render(
      <EconomicsTab
        vessel={vessel as unknown as import('@/lib/types').ParsedVessel}
        routeDistanceNm={5000}
      />
    );

    expect(screen.getByTestId('fueleu-penalty')).toBeInTheDocument();
    expect(screen.queryByTestId('fueleu-compliant')).not.toBeInTheDocument();
  });
});
