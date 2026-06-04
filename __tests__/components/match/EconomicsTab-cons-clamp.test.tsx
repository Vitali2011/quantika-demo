/**
 * @jest-environment jsdom
 *
 * PI2 behavioral test: vessel-consumption clamp in EconomicsTab.
 * SEAGULL 78 (3200 DWT coaster, consumption='22 mt/day') must send
 * consMtPerDay=6 (not 22) to bunker-recommendation and consumptionMtPerDay=6
 * to /api/voyage/tce.
 */
import '@testing-library/jest-dom';
import { render, act, waitFor } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';

const SEAGULL_78 = {
  emailId: 'sg78', itemIndex: 0,
  vesselName: { value: 'SEAGULL 78', confidence: 'confirmed' as const },
  dwtSummer: { value: 3_200, confidence: 'confirmed' as const },
  speedLaden: '10 kts',
  consumption: '22 mt/day',
  openPosition: null, openDate: null, restrictions: [], specialFeatures: [],
} as unknown as Parameters<typeof EconomicsTab>[0]['vessel'];

const NORMAL_VESSEL = {
  emailId: 'mv1', itemIndex: 0,
  vesselName: { value: 'MV Normal', confidence: 'confirmed' as const },
  dwtSummer: { value: 56_000, confidence: 'confirmed' as const },
  speedLaden: '13 kts',
  consumption: '26 mt/day',
  openPosition: null, openDate: null, restrictions: [], specialFeatures: [],
} as unknown as Parameters<typeof EconomicsTab>[0]['vessel'];

const CARGO = {
  emailId: 'c1', itemIndex: 0,
  originPort: { value: 'TRNMB', confidence: 'confirmed' as const, sourceText: 'Nemrut Bay' },
  destinationPort: { value: 'GBLIV', confidence: 'confirmed' as const, sourceText: 'Liverpool' },
  weightMt: { value: 2_500, confidence: 'confirmed' as const, sourceText: '2500 mt' },
} as unknown as Parameters<typeof EconomicsTab>[0]['cargo'];

const NORMAL_CARGO = {
  emailId: 'c2', itemIndex: 0,
  originPort: { value: 'ESBCN', confidence: 'confirmed' as const, sourceText: 'Barcelona' },
  destinationPort: { value: 'NLRTM', confidence: 'confirmed' as const, sourceText: 'Rotterdam' },
  weightMt: { value: 50_000, confidence: 'confirmed' as const, sourceText: '50k mt' },
} as unknown as Parameters<typeof EconomicsTab>[0]['cargo'];

function mockFetchFor(vessel: Parameters<typeof EconomicsTab>[0]['vessel']) {
  const fetchMock = jest.fn((url: string | Request) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('bunker-recommendation')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          fallback: false,
          port: 'GIGIB', priceUsdPerMt: 650, recommendation: 'Bunker at Gibraltar',
          savingsUsd: 0, liftTonnes: 90, capacityMt: 224, liftCapped: false,
          candidates: [],
        }),
      } as Response);
    }
    if (u.includes('/api/market/benchmark')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: 75, period: '2026-06' }) } as Response);
    }
    if (u.includes('/api/voyage/tce')) {
      return Promise.resolve({
        ok: true, json: () => Promise.resolve({
          breakdown: {
            bunker_usd: 55000, canal_usd: 0, da_usd: 2000, war_risk_usd: 0,
            ets_usd: 0, ets_eur: 0, gross_freight_usd: 100000,
            total_costs_usd: 57000, net_voyage_usd: 43000, daily_tce_usd: 2150,
            applicable: { bunker: true, canal: false, da: true, war_risk: false, ets: false },
          },
          daily_tce_usd: 2150,
        }),
      } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => jest.restoreAllMocks());

describe('EconomicsTab — consumption clamp (SEAGULL 78)', () => {
  it('sends consMtPerDay=6 (not 22) to bunker-recommendation for 3200 DWT coaster', async () => {
    const fetchMock = mockFetchFor(SEAGULL_78);
    await act(async () => {
      render(
        <EconomicsTab
          vessel={SEAGULL_78}
          cargo={CARGO}
          routeDistanceNm={3800}
          storedFreightRate={18}
        />,
      );
    });
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([u]) =>
        (u as string).includes('bunker-recommendation'),
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const url = calls[0][0] as string;
      expect(url).toContain('consMtPerDay=6');
      expect(url).not.toContain('consMtPerDay=22');
    });
  });

  it('sends consumptionMtPerDay=6 to /api/voyage/tce for 3200 DWT coaster', async () => {
    const fetchMock = mockFetchFor(SEAGULL_78);
    await act(async () => {
      render(
        <EconomicsTab
          vessel={SEAGULL_78}
          cargo={CARGO}
          routeDistanceNm={3800}
          storedFreightRate={18}
        />,
      );
    });
    await waitFor(() => {
      const allCalls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      const tceCalls = allCalls.filter(([u]) => u.includes('/api/voyage/tce'));
      expect(tceCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(tceCalls[0][1].body as string);
      expect(body.vessel.consumptionMtPerDay).toBe(6);
    });
  });

  it('does NOT clamp normal supramax vessel (26 t/day, 56000 DWT)', async () => {
    const fetchMock = mockFetchFor(NORMAL_VESSEL);
    await act(async () => {
      render(
        <EconomicsTab
          vessel={NORMAL_VESSEL}
          cargo={NORMAL_CARGO}
          routeDistanceNm={5000}
          storedFreightRate={15}
        />,
      );
    });
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([u]) =>
        (u as string).includes('bunker-recommendation'),
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const url = calls[0][0] as string;
      expect(url).toContain('consMtPerDay=26');
    });
  });

  it('sends consumptionMtPerDay=26 unchanged to tce for normal supramax', async () => {
    const fetchMock = mockFetchFor(NORMAL_VESSEL);
    await act(async () => {
      render(
        <EconomicsTab
          vessel={NORMAL_VESSEL}
          cargo={NORMAL_CARGO}
          routeDistanceNm={5000}
          storedFreightRate={15}
        />,
      );
    });
    await waitFor(() => {
      const allCalls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      const tceCalls = allCalls.filter(([u]) => u.includes('/api/voyage/tce'));
      expect(tceCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(tceCalls[0][1].body as string);
      expect(body.vessel.consumptionMtPerDay).toBe(26);
    });
  });
});
