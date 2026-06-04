/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';

const MOCK_BREAKDOWN = {
  breakdown: {
    bunker_usd: 90000, canal_usd: 0, da_usd: 3000, war_risk_usd: 0, ets_usd: 0, ets_eur: 0,
    gross_freight_usd: 520000, total_costs_usd: 93000, net_voyage_usd: 427000, daily_tce_usd: 17000,
    applicable: { bunker: true, canal: false, da: true, war_risk: false, ets: false },
  },
  daily_tce_usd: 17000,
};

afterEach(() => jest.restoreAllMocks());

const FULL_VESSEL = {
  emailId: 'e1', itemIndex: 0,
  dwtSummer: { value: 56_000, confidence: 'confirmed' as const },
  speedLaden: '13.5 kn', consumption: '28 mt/day',
  restrictions: [], specialFeatures: [],
};

const FULL_CARGO = {
  emailId: 'e1', itemIndex: 0,
  originPort: { value: 'TRMAR', confidence: 'confirmed' as const },
  destinationPort: { value: 'MXVER', confidence: 'confirmed' as const },
  weightMt: { value: 45_000, confidence: 'confirmed' as const },
};

test('Attack 11: manual port selection prevents recommendation override', async () => {
  let recoCallCount = 0;
  const fetchMock = jest.fn((url: string | Request) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('/api/market/benchmark')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: 68, period: '2026-06' }) });
    }
    if (u.includes('/api/voyage/bunker-recommendation')) {
      recoCallCount++;
      return Promise.resolve({
        ok: true, json: () => Promise.resolve({
          fallback: false, port: 'GIGIB', priceUsdPerMt: 747,
          recommendation: 'Bunker at Gibraltar', savingsUsd: 0,
          liftTonnes: 350, capacityMt: 1400, liftCapped: false, candidates: [],
        }),
      });
    }
    if (u.includes('/api/voyage/tce')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BREAKDOWN) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }) as jest.Mock;
  global.fetch = fetchMock;

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

  // Wait for recommendation to fire and set GIGIB
  await waitFor(() => {
    const portSelect = screen.getByLabelText('Bunker port') as HTMLSelectElement;
    expect(portSelect.value).toBe('GIGIB');
  });

  // User manually selects NLRTM
  const portSelect = screen.getByLabelText('Bunker port') as HTMLSelectElement;
  await act(async () => {
    fireEvent.change(portSelect, { target: { value: 'NLRTM' } });
  });
  expect(portSelect.value).toBe('NLRTM');

  // Even if recommendation fires again (grade change triggers re-fetch), NLRTM should persist
  const gradeSelect = screen.getByLabelText('Bunker grade') as HTMLSelectElement;
  await act(async () => {
    fireEvent.change(gradeSelect, { target: { value: 'MGO' } });
  });
  // After grade change, recommendation re-fires but bunkerPortManual=true → should not override NLRTM
  await waitFor(() => {
    const ps = screen.getByLabelText('Bunker port') as HTMLSelectElement;
    expect(ps.value).toBe('NLRTM');
  });
});
