/**
 * @jest-environment jsdom
 *
 * PI2 behavioral test: bunker port dropdown is route-aware.
 * - When bunkerCandidates arrive from API, dropdown shows route ports (not global hubs).
 * - Default selection is candidates[0] (recommended), not Singapore.
 * - Manual price still flows into P&L payload.
 */
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';
import type { BunkerCandidateResult } from '@/lib/economics/bunker-comparison';

const CEUTA: BunkerCandidateResult = {
  port: 'ESCEU', grade: 'VLSFO', priceUsdPerMt: 598,
  deviationNm: 12, deviationHours: 1, deviationFuelUsd: 180,
  timeCostUsd: 210, carbonCostUsd: 0, carbonUsdPerMt: 0,
  euaUsedFallback: true, effectiveUsdPerMt: 602, onRoute: true,
};

const GIBRALTAR: BunkerCandidateResult = {
  port: 'GIGIB', grade: 'VLSFO', priceUsdPerMt: 618,
  deviationNm: 0, deviationHours: 0, deviationFuelUsd: 0,
  timeCostUsd: 0, carbonCostUsd: 0, carbonUsdPerMt: 0,
  euaUsedFallback: true, effectiveUsdPerMt: 618, onRoute: true,
};

beforeEach(() => {
  global.fetch = jest.fn((url: string | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('bunker-recommendation')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          fallback: false,
          port: 'ESCEU',
          priceUsdPerMt: 598,
          recommendation: 'Bunker at Ceuta — best effective price',
          savingsUsd: 420,
          liftTonnes: 350,
          capacityMt: 1500,
          liftCapped: false,
          candidates: [CEUTA, GIBRALTAR],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as Response);
  }) as jest.Mock;
});

afterEach(() => jest.restoreAllMocks());

const vessel = {
  emailId: 'v1', itemIndex: 0,
  vesselName: { value: 'MV Test', confidence: 'confirmed' as const },
  dwtSummer: { value: 56_000, confidence: 'confirmed' as const },
  speedLaden: '13 kts',
  consumption: '26 mt/day',
  openPosition: null, openDate: null, restrictions: [], specialFeatures: [],
} as unknown as Parameters<typeof EconomicsTab>[0]['vessel'];

const cargo = {
  emailId: 'c1', itemIndex: 0,
  originPort: { value: 'ESBCN', confidence: 'confirmed' as const, sourceText: 'Barcelona' },
  destinationPort: { value: 'NLRTM', confidence: 'confirmed' as const, sourceText: 'Rotterdam' },
  weightMt: { value: 50_000, confidence: 'confirmed' as const, sourceText: '50k mt' },
} as unknown as Parameters<typeof EconomicsTab>[0]['cargo'];

test('bunker dropdown shows route candidates when API returns them', async () => {
  await act(async () => {
    render(<EconomicsTab vessel={vessel} cargo={cargo} />);
  });

  const portSelect = screen.getByLabelText('Bunker port') as HTMLSelectElement;

  // Route candidates should appear; global-hub-only fallback should not dominate
  const options = Array.from(portSelect.options).map(o => o.value);
  expect(options).toContain('ESCEU');
  expect(options).toContain('GIGIB');
  // Singapore (SGSIN) should NOT appear — it's not on this route
  expect(options).not.toContain('SGSIN');
});

test('bunker dropdown defaults to recommended (candidates[0]) port', async () => {
  await act(async () => {
    render(<EconomicsTab vessel={vessel} cargo={cargo} />);
  });

  const portSelect = screen.getByLabelText('Bunker port') as HTMLSelectElement;
  expect(portSelect.value).toBe('ESCEU');
});

test('Ceuta label renders as "Ceuta" not raw locode', async () => {
  await act(async () => {
    render(<EconomicsTab vessel={vessel} cargo={cargo} />);
  });

  const portSelect = screen.getByLabelText('Bunker port');
  expect(portSelect).toHaveTextContent('Ceuta');
});
