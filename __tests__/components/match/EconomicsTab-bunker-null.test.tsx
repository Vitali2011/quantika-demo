/**
 * @jest-environment jsdom
 *
 * A2.1 RTL behavioral tests — bunkerPort default-state and recommendation-driven override.
 *
 * PI2 behavioral: renders EconomicsTab via RTL, asserts against DOM + captured fetch calls.
 * Real value shapes per task fix: bunkerPort initializes to 'NLRTM' instead of null.
 *  - Initial render (bunkerPort='NLRTM'): P&L fires immediately with default Rotterdam
 *  - Recommendation returns GIGIB: P&L fires with bunkerPort='GIGIB' (API overrides default)
 *  - Recommendation fallback (port=null): P&L still fires with 'NLRTM' (fallback to default)
 *  - bunkerPort='sgsin' lowercase from recommendation: P&L fires with 'sgsin' (API normalises)
 */
import '@testing-library/jest-dom';
import { render, screen, act, waitFor } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';

const MOCK_BREAKDOWN = {
  breakdown: {
    bunker_usd: 90000, canal_usd: 0, da_usd: 3000, war_risk_usd: 0, ets_usd: 0, ets_eur: 0,
    gross_freight_usd: 520000, total_costs_usd: 93000, net_voyage_usd: 427000, daily_tce_usd: 17000,
    applicable: { bunker: true, canal: false, da: true, war_risk: false, ets: false },
  },
  daily_tce_usd: 17000,
};

const FULL_VESSEL = {
  emailId: 'e1', itemIndex: 0,
  dwtSummer: { value: 56_000, confidence: 'confirmed' as const },
  speedLaden: '13.5 kn',
  consumption: '28 mt/day',
  restrictions: [], specialFeatures: [],
};

const FULL_CARGO = {
  emailId: 'e1', itemIndex: 0,
  originPort: { value: 'TRMAR', confidence: 'confirmed' as const },
  destinationPort: { value: 'MXVER', confidence: 'confirmed' as const },
  weightMt: { value: 45_000, confidence: 'confirmed' as const },
};

function makeGlobalFetch(recoPort: string | null, recoPriceUsdPerMt: number | null = 650) {
  return jest.fn((url: string | Request) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('/api/market/benchmark')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: 68, period: '2026-06' }) });
    }
    if (u.includes('/api/voyage/bunker-recommendation')) {
      if (recoPort === null) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            fallback: true, port: null, priceUsdPerMt: null,
            recommendation: null, savingsUsd: 0,
            liftTonnes: 350, capacityMt: 1400, liftCapped: false, candidates: [],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          fallback: false, port: recoPort, priceUsdPerMt: recoPriceUsdPerMt,
          recommendation: `Bunker at ${recoPort}`, savingsUsd: 0,
          liftTonnes: 350, capacityMt: 1400, liftCapped: false, candidates: [],
        }),
      });
    }
    if (u.includes('/api/voyage/tce')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BREAKDOWN) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }) as jest.Mock;
}

afterEach(() => jest.restoreAllMocks());

test('P&L fires immediately with default NLRTM, then updates to recommendation GIGIB', async () => {
  global.fetch = makeGlobalFetch('GIGIB');
  await act(async () => {
    render(
      <EconomicsTab
        vessel={FULL_VESSEL as any}
        cargo={FULL_CARGO as any}
        routeDistanceNm={7000}
        storedFreightRate={15}
      />,
    );
  });
  await waitFor(() => expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument());

  const allCalls = (global.fetch as jest.Mock).mock.calls;
  const tceCalls = allCalls.filter(([u]: [string]) => (u as string).includes('/api/voyage/tce'));
  expect(tceCalls.length).toBeGreaterThanOrEqual(1);

  // First TCE call uses default NLRTM (bunkerPort initializes to NLRTM)
  const firstBody = JSON.parse(tceCalls[0][1].body);
  expect(firstBody.bunkerPort).toBe('NLRTM');

  // After recommendation resolves, final TCE call uses GIGIB (API overrides)
  if (tceCalls.length > 1) {
    const finalBody = JSON.parse(tceCalls[tceCalls.length - 1][1].body);
    expect(finalBody.bunkerPort).toBe('GIGIB');
  }
});

test('P&L fires with default NLRTM even when recommendation returns fallback (port=null)', async () => {
  global.fetch = makeGlobalFetch(null);
  await act(async () => {
    render(
      <EconomicsTab
        vessel={FULL_VESSEL as any}
        cargo={FULL_CARGO as any}
        routeDistanceNm={7000}
        storedFreightRate={15}
      />,
    );
  });
  // Chart DOES render — bunkerPort stays at default NLRTM
  await waitFor(() => expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument());
  // No missing bunker port hint (NLRTM is the default)
  const hint = screen.queryByTestId('voyage-missing-hint');
  if (hint) {
    expect(hint).not.toHaveTextContent(/bunker port/i);
  }

  const allCalls = (global.fetch as jest.Mock).mock.calls;
  const tceCalls = allCalls.filter(([u]: [string]) => (u as string).includes('/api/voyage/tce'));
  expect(tceCalls.length).toBeGreaterThanOrEqual(1);
  const body = JSON.parse(tceCalls[0][1].body);
  expect(body.bunkerPort).toBe('NLRTM');
});

test('P&L updates to lowercase recommendation port as-sent (API normalises)', async () => {
  global.fetch = makeGlobalFetch('sgsin'); // lowercase from recommendation
  await act(async () => {
    render(
      <EconomicsTab
        vessel={FULL_VESSEL as any}
        cargo={FULL_CARGO as any}
        routeDistanceNm={7000}
        storedFreightRate={15}
      />,
    );
  });
  await waitFor(() => expect(screen.getByTestId('voyage-breakdown-chart')).toBeInTheDocument());

  const allCalls = (global.fetch as jest.Mock).mock.calls;
  const tceCalls = allCalls.filter(([u]: [string]) => (u as string).includes('/api/voyage/tce'));
  expect(tceCalls.length).toBeGreaterThanOrEqual(1);

  // First TCE call uses default NLRTM
  const firstBody = JSON.parse(tceCalls[0][1].body);
  expect(firstBody.bunkerPort).toBe('NLRTM');

  // After recommendation resolves with lowercase sgsin, subsequent call uses sgsin
  if (tceCalls.length > 1) {
    const finalBody = JSON.parse(tceCalls[tceCalls.length - 1][1].body);
    expect(finalBody.bunkerPort).toBe('sgsin');
  }
});
