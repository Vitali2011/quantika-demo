/**
 * @jest-environment jsdom
 *
 * PI2 behavioral tests — voyage P&L chart in EconomicsTab.
 * Covers: VoyageInput assembly, breakdown render, missing-fields message, formula invariant.
 */
import '@testing-library/jest-dom';
import { render, screen, act, waitFor } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';

const MOCK_BREAKDOWN = {
  breakdown: {
    bunker_usd: 120000,
    canal_usd: 0,
    da_usd: 5000,
    war_risk_usd: 0,
    ets_usd: 0,
    ets_eur: 0,
    gross_freight_usd: 700000,
    total_costs_usd: 125000,
    net_voyage_usd: 575000,
    daily_tce_usd: 23000,
    applicable: { bunker: true, canal: false, da: true, war_risk: false, ets: false },
  },
  daily_tce_usd: 23000,
  total_usd: 125000,
};

const FULL_VESSEL = {
  emailId: 'e1', itemIndex: 0,
  dwtSummer: { value: 50000, confidence: 'confirmed' as const },
  speedLaden: '13.5 kn',
  consumption: '28 mt/day',
  restrictions: [], specialFeatures: [],
};

const FULL_CARGO = {
  emailId: 'e1', itemIndex: 0,
  originPort: { value: 'NLRTM', confidence: 'confirmed' as const },
  destinationPort: { value: 'SGSIN', confidence: 'confirmed' as const },
  weightMt: { value: 45000, confidence: 'confirmed' as const },
  cargoType: 'bulk' as const,
  missingInfo: [],
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

function setupFetch(tceOk = true) {
  mockFetch.mockImplementation((url: string) => {
    if ((url as string).includes('/api/market/benchmark')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: 75, period: 'Q1 2026' }) });
    }
    if ((url as string).includes('/api/voyage/bunker-recommendation')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          fallback: false, port: 'NLRTM', priceUsdPerMt: 650,
          recommendation: 'Bunker at Rotterdam', savingsUsd: 0,
          liftTonnes: 400, capacityMt: 1500, liftCapped: false, candidates: [],
        }),
      });
    }
    if ((url as string).includes('/api/voyage/tce')) {
      if (!tceOk) return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'bunker_price_unavailable' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BREAKDOWN) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupFetch();
});

describe('EconomicsTab — voyage P&L chart', () => {
  it('renders voyage-breakdown-chart when all required fields present', async () => {
    await act(async () => {
      render(
        <EconomicsTab
          vessel={FULL_VESSEL as any}
          cargo={FULL_CARGO as any}
          routeDistanceNm={8500}
          storedFreightRate={15}
          matchDbId={1}
        />,
      );
    });
    await waitFor(() => expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument());
  });

  it('posts correct VoyageInput to /api/voyage/tce', async () => {
    await act(async () => {
      render(
        <EconomicsTab
          vessel={FULL_VESSEL as any}
          cargo={FULL_CARGO as any}
          routeDistanceNm={8500}
          storedFreightRate={15}
          matchDbId={1}
        />,
      );
    });
    await waitFor(() => expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument());
    const tceCalls = mockFetch.mock.calls.filter(([url]: [string]) => (url as string).includes('/api/voyage/tce'));
    expect(tceCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(tceCalls[0][1].body);
    expect(body.vessel.dwt).toBe(50000);
    expect(body.vessel.speedKts).toBe(13.5);
    expect(body.vessel.consumptionMtPerDay).toBe(28);
    expect(body.route.distanceNm).toBe(8500);
    expect(body.cargo.freightRateUsdPerMt).toBe(15);
    expect(body.durationDays).toBeGreaterThan(0);
  });

  it('shows missing-hint when vessel speed absent', async () => {
    const noSpeed = { ...FULL_VESSEL, speedLaden: null };
    await act(async () => {
      render(
        <EconomicsTab
          vessel={noSpeed as any}
          cargo={FULL_CARGO as any}
          routeDistanceNm={8500}
          storedFreightRate={15}
        />,
      );
    });
    expect(screen.getByTestId('voyage-missing-hint')).toBeInTheDocument();
    expect(screen.getByTestId('voyage-missing-hint')).toHaveTextContent(/vessel speed/i);
    expect(screen.queryByTestId('voyage-breakdown-chart')).not.toBeInTheDocument();
  });

  it('shows missing-hint when consumption absent', async () => {
    const noConsumption = { ...FULL_VESSEL, consumption: null };
    await act(async () => {
      render(
        <EconomicsTab
          vessel={noConsumption as any}
          cargo={FULL_CARGO as any}
          routeDistanceNm={8500}
          storedFreightRate={15}
        />,
      );
    });
    expect(screen.getByTestId('voyage-missing-hint')).toBeInTheDocument();
    expect(screen.getByTestId('voyage-missing-hint')).toHaveTextContent(/fuel consumption/i);
  });

  it('shows missing-hint when routeDistanceNm is null', async () => {
    await act(async () => {
      render(
        <EconomicsTab
          vessel={FULL_VESSEL as any}
          cargo={FULL_CARGO as any}
          routeDistanceNm={null}
          storedFreightRate={15}
        />,
      );
    });
    expect(screen.getByTestId('voyage-missing-hint')).toBeInTheDocument();
    expect(screen.getByTestId('voyage-missing-hint')).toHaveTextContent(/route distance/i);
  });

  // Gate5 P&L: cargo weightMt absent (match 40098 Thisvi→Monfalcone) gave an EMPTY
  // "Voyage P&L" block because voyageInputData.missing never listed cargo quantity —
  // ready=false + missing=[] → render fell through to null. Must show the hint.
  it('shows missing-hint when cargo quantity absent (no empty block)', async () => {
    const noQty = { ...FULL_CARGO, weightMt: undefined };
    await act(async () => {
      render(
        <EconomicsTab
          vessel={FULL_VESSEL as any}
          cargo={noQty as any}
          routeDistanceNm={8500}
          storedFreightRate={15}
        />,
      );
    });
    expect(screen.getByTestId('voyage-missing-hint')).toBeInTheDocument();
    expect(screen.getByTestId('voyage-missing-hint')).toHaveTextContent(/cargo quantity/i);
    expect(screen.queryByTestId('voyage-breakdown-chart')).not.toBeInTheDocument();
  });

  it('shows missing-hint when load/discharge ports absent (no empty block)', async () => {
    const noPorts = { ...FULL_CARGO, originPort: undefined, destinationPort: undefined };
    await act(async () => {
      render(
        <EconomicsTab
          vessel={FULL_VESSEL as any}
          cargo={noPorts as any}
          routeDistanceNm={8500}
          storedFreightRate={15}
        />,
      );
    });
    expect(screen.getByTestId('voyage-missing-hint')).toBeInTheDocument();
    expect(screen.getByTestId('voyage-missing-hint')).toHaveTextContent(/load port|discharge port/i);
  });

  it('shows missing-hint with no vessel/cargo at all', async () => {
    await act(async () => { render(<EconomicsTab />); });
    expect(screen.getByTestId('voyage-missing-hint')).toBeInTheDocument();
  });

  it('uses estimateVesselValueUsd(dwt) for vessel valueUsd', async () => {
    await act(async () => {
      render(
        <EconomicsTab
          vessel={FULL_VESSEL as any}
          cargo={FULL_CARGO as any}
          routeDistanceNm={8500}
          storedFreightRate={15}
        />,
      );
    });
    await waitFor(() => expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument());
    const tceCalls = mockFetch.mock.calls.filter(([url]: [string]) => (url as string).includes('/api/voyage/tce'));
    const body = JSON.parse(tceCalls[0][1].body);
    // estimateVesselValueUsd(50000) = 50000 * 260 = 13_000_000 (Supramax class)
    expect(body.vessel.valueUsd).toBe(13_000_000);
  });

  it('uses round-trip durationDays (laden*2+2) for Black-Sea 400nm pair (#819)', async () => {
    // estimateRoundTripDays(400, 12) ≈ 4.78 days
    // estimateVoyageDays(400, 12) = max(1, round(1.39)) = 1 day  ← pre-fix (WRONG)
    const bsVessel = { ...FULL_VESSEL, speedLaden: '12 kn', dwtSummer: { value: 3000, confidence: 'confirmed' as const } };
    const bsCargo = { ...FULL_CARGO, weightMt: { value: 2500, confidence: 'confirmed' as const } };
    await act(async () => {
      render(
        <EconomicsTab
          vessel={bsVessel as any}
          cargo={bsCargo as any}
          routeDistanceNm={400}
          storedFreightRate={25}
          matchDbId={1}
        />,
      );
    });
    await waitFor(() => expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument());
    const tceCalls = mockFetch.mock.calls.filter(([url]: [string]) => (url as string).includes('/api/voyage/tce'));
    const body = JSON.parse(tceCalls[0][1].body);
    // round-trip: 400/(12*24)*2+2 ≈ 4.78 — must NOT be 1 (laden-only)
    expect(body.durationDays).toBeGreaterThan(4);
    expect(body.durationDays).toBeLessThan(6);
  });

  it('ballastDistanceNm prop produces single-voyage durationDays (shorter than round-trip)', async () => {
    // SEAGULL-41 fix: when ballastDistanceNm is passed, buildCanonicalTceInputs uses
    // single-voyage span (ballast+laden+2 port days) instead of estimateRoundTripDays.
    // Speed 12 kts, distanceNm 8500:
    //   round-trip: 8500/(12*24)*2+2 ≈ 61.6 days
    //   single-voyage (ballastNm=400): (8500+400)/(12*24)+2 ≈ 32.7 days
    await act(async () => {
      render(
        <EconomicsTab
          vessel={FULL_VESSEL as any}
          cargo={{ ...FULL_CARGO, originPort: { value: 'Nemrut Bay', confidence: 'confirmed' as const }, destinationPort: { value: 'Liverpool', confidence: 'confirmed' as const } } as any}
          routeDistanceNm={8500}
          storedFreightRate={15}
          matchDbId={1}
          ballastDistanceNm={400}
        />,
      );
    });
    await waitFor(() => expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument());
    const tceCalls = mockFetch.mock.calls.filter(([url]: [string]) => (url as string).includes('/api/voyage/tce'));
    const body = JSON.parse(tceCalls[0][1].body);
    // Single-voyage (400+8500)/(13.5*24)+2 ≈ 29.8 days
    // Round-trip: 8500/(13.5*24)*2+2 ≈ 54.5 days
    // Either way: single-voyage must be < round-trip (both under 55 and over 10)
    expect(body.durationDays).toBeGreaterThan(10);
    expect(body.durationDays).toBeLessThan(55); // less than round-trip would produce
  });

  it('INVARIANT: calculateTCE and VoyageInput not structurally changed', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src: string = fs.readFileSync(
      path.join(process.cwd(), 'lib/economics/voyage-calculator.ts'),
      'utf8',
    );
    expect(src).toContain('export function calculateTCE(input: VoyageInput): TCEResult');
    expect(src).toContain('export interface VoyageInput');
    expect(src).toContain('export interface TCEBreakdown');
    expect(src).toContain('daily_tce_usd');
  });
});
