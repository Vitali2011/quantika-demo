/**
 * β-06 Route Decision (Suez vs Cape) — TDD tests.
 *
 * Discipline: ≤30 expects total (pipeline guard).
 * Mocks lib/openai callAiText to keep tests deterministic and offline.
 */

import fs from 'fs';
import path from 'path';

jest.mock('@/lib/openai', () => ({
  callAiText: jest.fn(),
  callAiJson: jest.fn(),
}));

import { callAiText } from '@/lib/openai';
import { compareRoutes } from '@/lib/economics/route-decision';

const mockedCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;

interface DemoScenario {
  cargo: {
    originPort: { value: string };
    destinationPort: { value: string };
    weightMt: { value: number };
  };
  vessel: {
    dwtSummer: { value: number };
    speedLaden: string;
  };
}

function loadScenario(): DemoScenario {
  const p = path.join(
    process.cwd(),
    'lib',
    'sample-data',
    'demo-scenarios',
    '11-suez-vs-cape-decision.json',
  );
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const VESSEL = {
  dwt: 76000,
  valueUsd: 22_000_000,
  speedKts: 13.5,
  consumptionMtPerDay: 29,
};

const CARGO = {
  quantityMt: 65000,
  freightRateUsdPerMt: 28,
};

const MARKET = { bunkerPriceUsdPerMt: 620, euaPriceEur: 75 };

describe('compareRoutes — β-06', () => {
  beforeEach(() => {
    mockedCallAiText.mockReset();
  });

  it('returns side-by-side TCE for Suez and Cape with a recommendation', async () => {
    mockedCallAiText.mockResolvedValue('Cape is preferred — war-risk premium erodes Suez TCE.');

    const result = await compareRoutes('Singapore', 'Rotterdam', VESSEL, CARGO, MARKET);

    expect(result.suez.durationDays).toBeGreaterThan(0);
    expect(result.cape.durationDays).toBeGreaterThan(result.suez.durationDays);
    expect(result.suez.breakdown.canal_usd).toBeGreaterThan(0);
    expect(result.cape.breakdown.canal_usd).toBe(0);
    expect(['suez', 'cape']).toContain(result.recommendation.route);
    expect(result.recommendation.reason.length).toBeGreaterThan(0);
    expect(Number.isFinite(result.recommendation.savings_usd)).toBe(true);
    expect(Number.isFinite(result.recommendation.savings_days)).toBe(true);
  });

  it('uses LLM-generated rationale when available', async () => {
    mockedCallAiText.mockResolvedValue('LLM says Cape wins by $X/day.');

    const result = await compareRoutes('Singapore', 'Rotterdam', VESSEL, CARGO, MARKET);

    expect(mockedCallAiText).toHaveBeenCalledTimes(1);
    expect(result.recommendation.reason).toBe('LLM says Cape wins by $X/day.');
  });

  it('falls back to template when LLM throws (no exception propagated)', async () => {
    mockedCallAiText.mockRejectedValue(new Error('cliproxy down'));

    const result = await compareRoutes('Singapore', 'Rotterdam', VESSEL, CARGO, MARKET);

    expect(result.recommendation.reason).toMatch(/saves|days|vs/i);
    expect(result.recommendation.reason.length).toBeGreaterThan(0);
  });

  it('falls back to template when LLM returns empty string', async () => {
    mockedCallAiText.mockResolvedValue('   ');

    const result = await compareRoutes('Singapore', 'Rotterdam', VESSEL, CARGO, MARKET);

    expect(result.recommendation.reason.length).toBeGreaterThan(0);
    expect(result.recommendation.reason).not.toBe('   ');
  });

  it('matches demo scenario 11 cargo/vessel parameters end-to-end', async () => {
    mockedCallAiText.mockResolvedValue('ok');
    const scenario = loadScenario();

    const result = await compareRoutes(
      scenario.cargo.originPort.value,
      scenario.cargo.destinationPort.value,
      VESSEL,
      { quantityMt: scenario.cargo.weightMt.value, freightRateUsdPerMt: 28 },
      MARKET,
    );

    expect(result.suez).toBeDefined();
    expect(result.cape).toBeDefined();
    expect(result.recommendation.savings_usd).toBeGreaterThanOrEqual(0);
    expect(result.recommendation.savings_days).toBeGreaterThanOrEqual(0);
  });

  it('savings_usd reflects the daily TCE delta × winner durationDays direction', async () => {
    mockedCallAiText.mockResolvedValue('ok');

    const result = await compareRoutes('Singapore', 'Rotterdam', VESSEL, CARGO, MARKET);
    const winner = result[result.recommendation.route];
    const loserKey = result.recommendation.route === 'suez' ? 'cape' : 'suez';
    const loser = result[loserKey];

    expect(winner.daily_tce_usd).toBeGreaterThanOrEqual(loser.daily_tce_usd);
  });
});
