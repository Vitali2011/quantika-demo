/**
 * @jest-environment jsdom
 *
 * Regression test: headline TCE must use the BASELINE bunker port (NLRTM)
 * even when the bunker-recommendation API returns a different port (GIGIB).
 *
 * Oracle: the POST body sent to /api/voyage/tce must contain bunkerPort==='NLRTM',
 * NOT the recommended port. The recommendation is advisory only.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
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

// ── Minimal valid TCEBreakdown ──
const FIXTURE_BREAKDOWN: TCEBreakdown = {
  freight_rate_usd_per_mt: 28,
  quantity_mt: 50000,
  duration_days: 18,
  bunker_consumption_mt_per_day: 26,
  bunker_price_usd_per_mt: 791,
  gross_freight_usd: 1_400_000,
  bunker_usd: 252_720,
  canal_usd: 0,
  da_usd: 55_000,
  war_risk_usd: 0,
  ets_eur: 0,
  ets_usd: 0,
  fueleu_usd: 0, // audit A.5: new breakdown field
  total_costs_usd: 307_720,
  net_voyage_usd: 1_092_280,
  daily_tce_usd: 60_682,
  applicable: {
    bunker: true,
    canal: false,
    da: true,
    war_risk: false,
    ets: false,
    fueleu: false, // audit A.5: new breakdown field
  },
};

// ── Helper to create a ConfidenceField<T> ──
function cf<T>(value: T): ConfidenceField<T> {
  return { value, confidence: 'confirmed' };
}

// ── Vessel and cargo fixtures — same shape as toggle test ──
const vessel: ParsedVessel = {
  dwtSummer: cf(55000),
  speedLaden: '14 kn' as unknown as ConfidenceField<string>,
  consumption: '26 mt/day' as unknown as ConfidenceField<string>,
  vesselName: null,
  dwcc: null,
  draftMax: null,
  openPosition: cf('Nemrut Bay'),
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

// Mediterranean route that would normally trigger a GIGIB recommendation
const cargo: ParsedCargo = {
  originPort: cf('Nemrut Bay'),
  destinationPort: cf('Liverpool'),
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

describe('EconomicsTab — bunker baseline oracle (list↔detail TCE parity)', () => {
  it('sends bunkerPort=NLRTM in the /api/voyage/tce POST even when recommendation returns GIGIB', async () => {
    // Capture the POST body sent to /api/voyage/tce
    let capturedBody: Record<string, unknown> | null = null;

    const mockFetch = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/market/benchmark?indicator=EUA') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: 65, period: '2026-06' }),
        });
      }
      if (String(url).includes('/api/voyage/bunker-recommendation')) {
        // Simulate Mediterranean route: recommendation returns GIGIB at $771
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            fallback: false,
            message: null,
            port: 'GIGIB',
            priceUsdPerMt: 771,
            recommendation: 'Bunker at GIGIB (Gibraltar) — saves ~$5,000',
            savingsUsd: 5000,
            candidates: [],
          }),
        });
      }
      if (url === '/api/voyage/tce') {
        // Capture the request body for assertion
        if (init?.body) {
          capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ breakdown: FIXTURE_BREAKDOWN }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    global.fetch = mockFetch as unknown as typeof fetch;

    render(
      <EconomicsTab
        vessel={vessel}
        cargo={cargo}
        routeDistanceNm={4500}
        storedFreightRate={28}
      />
    );

    // Wait until /api/voyage/tce was called at least once
    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/voyage/tce',
          expect.objectContaining({ method: 'POST' }),
        );
      },
      { timeout: 5000 },
    );

    // Oracle: the POST body must use the NLRTM baseline, NOT the GIGIB recommendation.
    // This is the invariant that guarantees LIST TCE === DETAIL headline TCE.
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.bunkerPort).toBe('NLRTM');
    expect(capturedBody!.bunkerPort).not.toBe('GIGIB');
  });
});
