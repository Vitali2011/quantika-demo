/**
 * @jest-environment jsdom
 *
 * B3 — "Показать расчёт" toggle tests.
 *
 * Asserts:
 *   - By default CalculationWaterfall is NOT in the DOM.
 *   - After clicking the toggle button it appears.
 *   - Clicking again hides it.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EconomicsTab } from '../EconomicsTab';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';
import type { ParsedVessel, ParsedCargo, ConfidenceField } from '@/lib/types';

// ── Silence console.error from expected missing prop warnings ──
const consoleError = console.error;
beforeAll(() => { console.error = jest.fn(); });
afterAll(() => { console.error = consoleError; });

// ── Mock complex sub-components that make their own fetch calls ──
jest.mock('@/components/economics/RouteCompareModal', () => ({
  RouteCompareModal: () => <div data-testid="route-compare-modal-mock" />,
}));

jest.mock('@/components/economics/BunkerComparisonTable', () => ({
  BunkerComparisonTable: () => <div data-testid="bunker-comparison-table-mock" />,
}));

// ── Minimal fixture breakdown (includes B1 derivation fields) ──
const FIXTURE_BREAKDOWN: TCEBreakdown = {
  freight_rate_usd_per_mt: 28,
  quantity_mt: 50000,
  duration_days: 18,
  bunker_consumption_mt_per_day: 26,
  bunker_price_usd_per_mt: 540,
  gross_freight_usd: 1_400_000,
  bunker_usd: 252_720,
  canal_usd: 0,
  da_usd: 55_000,
  war_risk_usd: 10_500,
  ets_eur: 0,
  ets_usd: 0,
  total_costs_usd: 318_220,
  net_voyage_usd: 1_081_780,
  daily_tce_usd: 60_099,
  applicable: {
    bunker: true,
    canal: false,
    da: true,
    war_risk: true,
    ets: false,
  },
};

// ── Helper to create a ConfidenceField<T> ──
function cf<T>(value: T): ConfidenceField<T> {
  return { value, confidence: 'confirmed' };
}

// ── Minimal props that make voyageInputData.ready = true ──
const vessel: ParsedVessel = {
  dwtSummer: cf(55000),
  speedLaden: '14 kn' as unknown as ConfidenceField<string>,
  consumption: '26 mt/day' as unknown as ConfidenceField<string>,
  // All other required fields can be null
  vesselName: null,
  dwcc: null,
  draftMax: null,
  openPosition: cf('Rotterdam'),
  openDate: null,
  flag: null,
  built: null,
  imoNumber: null,
  mmsi: null,
  vesselType: null,
  grainCubicM: null,
  bale: null,
  tpc: null,
  gearDescription: null,
  cranes: null,
  loa: null,
  beam: null,
  holdCount: null,
  hatchCount: null,
  hatchType: null,
  ssFitted: null,
  tcFitted: null,
  p1: null,
  owners: null,
  speedBallast: null,
  consumptionBallast: null,
  consumptionPort: null,
  charterPartyTrade: null,
  speedFull: null,
} as unknown as ParsedVessel;

const cargo: ParsedCargo = {
  originPort: cf('Rotterdam'),
  destinationPort: cf('Singapore'),
  weightMt: cf(50000),
  weightMtMax: undefined,
  cargoType: cf('GRAIN'),
  cargoDescription: null,
  preferredDates: null,
  laycanStart: null,
  laycanEnd: null,
  laycan: null,
  commissionPct: null,
  freightRate: null,
} as unknown as ParsedCargo;

function setupFetch(breakdown: TCEBreakdown) {
  // jest.setup.ts sets global.fetch to a non-ok mock; override for this suite.
  const mockFetch = jest.fn((url: string) => {
    if (url === '/api/market/benchmark?indicator=EUA') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ value: 65, period: '2026-06' }),
      });
    }
    if (String(url).includes('/api/voyage/bunker-recommendation')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          fallback: true,
          message: 'No recommendation',
          port: null,
          priceUsdPerMt: null,
          recommendation: null,
          savingsUsd: 0,
          candidates: [],
        }),
      });
    }
    if (url === '/api/voyage/tce') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ breakdown }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  global.fetch = mockFetch as unknown as typeof fetch;
  return mockFetch;
}

describe('EconomicsTab — "Показать расчёт" toggle (B3)', () => {
  beforeEach(() => {
    setupFetch(FIXTURE_BREAKDOWN);
  });

  it('toggle button is NOT in the DOM when voyageBreakdown is null (no breakdown yet)', () => {
    // No fetch mock that resolves voyage/tce — use the default non-ok mock
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }) as typeof global.fetch;

    render(
      <EconomicsTab
        vessel={vessel}
        cargo={cargo}
        routeDistanceNm={9000}
        storedFreightRate={28}
      />
    );

    // Toggle should not appear until breakdown loads
    expect(screen.queryByTestId('show-calc-toggle')).not.toBeInTheDocument();
  });

  it('toggle button appears and waterfall is hidden by default after breakdown loads', async () => {
    setupFetch(FIXTURE_BREAKDOWN);

    render(
      <EconomicsTab
        vessel={vessel}
        cargo={cargo}
        routeDistanceNm={9000}
        storedFreightRate={28}
      />
    );

    // Wait for the breakdown to load (VoyageBreakdownChart renders)
    await waitFor(() => {
      expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Toggle button present, waterfall hidden
    expect(screen.getByTestId('show-calc-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('calculation-waterfall')).not.toBeInTheDocument();
  });

  it('shows waterfall after clicking toggle', async () => {
    setupFetch(FIXTURE_BREAKDOWN);

    render(
      <EconomicsTab
        vessel={vessel}
        cargo={cargo}
        routeDistanceNm={9000}
        storedFreightRate={28}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByTestId('show-calc-toggle'));
    expect(screen.getByTestId('calculation-waterfall')).toBeInTheDocument();
  });

  it('hides waterfall on second click', async () => {
    setupFetch(FIXTURE_BREAKDOWN);

    render(
      <EconomicsTab
        vessel={vessel}
        cargo={cargo}
        routeDistanceNm={9000}
        storedFreightRate={28}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument();
    }, { timeout: 3000 });

    const toggle = screen.getByTestId('show-calc-toggle');
    fireEvent.click(toggle);
    expect(screen.getByTestId('calculation-waterfall')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByTestId('calculation-waterfall')).not.toBeInTheDocument();
  });
});
