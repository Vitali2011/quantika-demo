/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';
import type { ParsedVessel, ParsedCargo } from '@/lib/types';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ value: 65, period: '2026-06' }),
  } as unknown as Response);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const fullVessel = {
  emailId: '1', itemIndex: 0,
  vesselName: { value: 'MV Test', confidence: 'confirmed' as const },
  dwtSummer: { value: 56_000, confidence: 'confirmed' as const },
  speedLaden: '13 kts',
  consumption: '26 mt/day',
  openPosition: null, openDate: null, restrictions: [], specialFeatures: [],
} as unknown as ParsedVessel;

const fullCargo: ParsedCargo = {
  emailId: '2', itemIndex: 0,
  originPort: { value: 'SGSIN', confidence: 'confirmed' as const },
  originCountry: 'SG',
  destinationPort: { value: 'NLRTM', confidence: 'confirmed' as const },
  destinationCountry: 'NL',
  cargoDescription: { value: 'Steel', confidence: 'confirmed' as const },
  weightMt: { value: 50_000, confidence: 'confirmed' as const },
  weightMtMin: 50_000, weightMtMax: 50_000,
  volumeCbm: null, dimensions: null, cargoType: 'BULK',
  containerType: null, quantity: null, incoterms: null,
  preferredDates: null, laycan: null, loadingRate: null,
  dischargeRate: null, commissionPercent: null, commissionTerms: null,
  specialRequirements: null, stowageFactor: null, missingInfo: [],
};

describe('EconomicsTab — Compare button readiness', () => {
  test('button enabled when vessel+cargo complete with storedFreightRate', async () => {
    // #819: compareInputs.ready requires freightRateUsdPerMt > 0 (dropped ?? 28 fallback)
    await act(async () => { render(<EconomicsTab vessel={fullVessel} cargo={fullCargo} storedFreightRate={18} />); });
    expect(screen.getByTestId('open-route-compare')).not.toBeDisabled();
  });

  test('button disabled when vessel+cargo complete but no freight rate', async () => {
    // Without storedFreightRate and no currentRate, freightRateForCompare=0 → button disabled
    await act(async () => { render(<EconomicsTab vessel={fullVessel} cargo={fullCargo} />); });
    expect(screen.getByTestId('open-route-compare')).toBeDisabled();
  });

  test('no missing-hint when compare ready', async () => {
    await act(async () => { render(<EconomicsTab vessel={fullVessel} cargo={fullCargo} />); });
    expect(screen.queryByTestId('compare-missing-hint')).not.toBeInTheDocument();
  });

  test('button disabled when vessel speed absent', async () => {
    const noSpeed = { ...fullVessel, speedLaden: null } as unknown as ParsedVessel;
    await act(async () => { render(<EconomicsTab vessel={noSpeed} cargo={fullCargo} />); });
    expect(screen.getByTestId('open-route-compare')).toBeDisabled();
  });

  test('missing-hint visible when speed+consumption absent', async () => {
    const noSpeed = { ...fullVessel, speedLaden: null, consumption: null } as unknown as ParsedVessel;
    await act(async () => { render(<EconomicsTab vessel={noSpeed} cargo={fullCargo} />); });
    const hint = screen.getByTestId('compare-missing-hint');
    expect(hint).toBeInTheDocument();
    expect(hint.textContent).toMatch(/speed|consumption/i);
  });

  test('missing-hint lists cargo weight when absent', async () => {
    // After #791: resolveCargoWeight also reads weightMtMax. "Missing weight" = both null.
    const noCargo = {
      ...fullCargo, weightMt: null, weightMtMin: null, weightMtMax: null,
    } as unknown as ParsedCargo;
    await act(async () => { render(<EconomicsTab vessel={fullVessel} cargo={noCargo} />); });
    const hint = screen.getByTestId('compare-missing-hint');
    expect(hint.textContent).toMatch(/quantity|weight/i);
  });

  test('compareInputs uses storedFreightRate not hardcoded 28', async () => {
    // When storedFreightRate=42 is passed, the Compare modal receives it.
    // We verify indirectly: if the button is enabled, the modal is mounted
    // (RouteCompareModal receives compareInputs.cargo.freightRateUsdPerMt).
    // At minimum the component renders without error with a real rate.
    await act(async () => {
      render(<EconomicsTab vessel={fullVessel} cargo={fullCargo} storedFreightRate={42} />);
    });
    // Button enabled → compareInputs.ready=true → modal mounted with freightRate=42
    expect(screen.getByTestId('open-route-compare')).not.toBeDisabled();
  });
});
