/**
 * Audit finding #7: Suez-vs-Cape route comparison computed voyage duration
 * ONE-WAY while the canonical TCE path (compute-tce.ts → estimateRoundTripDays)
 * uses round-trip (ladenDays*2 + 2). Result: the modal bunker burn + TCE/day
 * were ~2x off vs the same vessel match card.
 *
 * These tests pin compareRoutes leg duration + bunker burn to the SAME
 * round-trip formula the match card uses, so the modal matches the card.
 *
 * AI reason path is mocked offline (route-decision routes through
 * @/lib/ai-provider; pin AI_PROVIDER=openai to delegate to the mocked layer).
 */

jest.mock('@/lib/openai', () => ({
  callAiText: jest.fn(),
  callAiJson: jest.fn(),
}));

import { callAiText } from '@/lib/openai';
import { compareRoutes } from '@/lib/economics/route-decision';
import { computeTce } from '@/lib/economics/compute-tce';
import { estimateRoundTripDays } from '@/lib/economics/voyage-days';

const mockedCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;

const VESSEL = {
  dwt: 76_000,
  valueUsd: 22_000_000,
  speedKts: 13.5,
  consumptionMtPerDay: 29,
};
const CARGO = { quantityMt: 65_000, freightRateUsdPerMt: 28 };
const MARKET = { bunkerPriceUsdPerMt: 620, euaPriceEur: 75 };

// Singapore|Rotterdam laden distances from DISTANCE_TABLE (rotterdam|singapore).
const SUEZ_NM = 8_300;
const CAPE_NM = 11_800;

describe('compareRoutes — round-trip duration parity (audit #7)', () => {
  beforeEach(() => {
    mockedCallAiText.mockReset();
    mockedCallAiText.mockResolvedValue('ok');
    process.env.AI_PROVIDER = 'openai';
  });

  it('suez leg duration uses round-trip (ladenDays*2+2), not one-way', async () => {
    const r = await compareRoutes('Singapore', 'Rotterdam', VESSEL, CARGO, MARKET);
    expect(r.suez.durationDays).toBeCloseTo(estimateRoundTripDays(SUEZ_NM, VESSEL.speedKts), 5);
    expect(r.suez.breakdown.duration_days).toBeCloseTo(
      estimateRoundTripDays(SUEZ_NM, VESSEL.speedKts),
      5,
    );
  });

  it('cape leg duration uses round-trip (ladenDays*2+2), not one-way', async () => {
    const r = await compareRoutes('Singapore', 'Rotterdam', VESSEL, CARGO, MARKET);
    expect(r.cape.durationDays).toBeCloseTo(estimateRoundTripDays(CAPE_NM, VESSEL.speedKts), 5);
  });

  it('suez bunker burn matches the canonical card TCE for the same laden leg', async () => {
    const r = await compareRoutes('Singapore', 'Rotterdam', VESSEL, CARGO, MARKET);

    // Canonical card basis: computeTce derives round-trip duration internally
    // (no overrideDurationDays). Bunker = consumption * round-trip-days * price.
    const card = computeTce({
      dwt: VESSEL.dwt,
      valueUsd: VESSEL.valueUsd,
      speedKts: VESSEL.speedKts,
      consumptionMtPerDay: VESSEL.consumptionMtPerDay,
      freightRateUsdPerMt: CARGO.freightRateUsdPerMt,
      quantityMt: CARGO.quantityMt,
      distanceNm: SUEZ_NM,
      bunkerPriceUsdPerMt: MARKET.bunkerPriceUsdPerMt,
      euaPriceEur: 0,
      canalUsd: 0,
      daUsd: 0,
    });

    expect(r.suez.breakdown.bunker_usd).toBe(card.breakdown.bunker_usd);
  });

  it('cape leg is still slower than suez (winner-selection basis unchanged)', async () => {
    const r = await compareRoutes('Singapore', 'Rotterdam', VESSEL, CARGO, MARKET);
    expect(r.cape.durationDays).toBeGreaterThan(r.suez.durationDays);
  });
});
