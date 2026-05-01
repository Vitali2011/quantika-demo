/**
 * β-09 regression: matching pipeline must return > 0 matches on demo data
 * even when the AI scorer is offline / returns [].
 *
 * Root cause investigation in docs/wave-beta/SENTINEL.md.
 *
 * Two layers protect against the original "0 matches" finding:
 *   1. Seed filter — separate CARGO_REGION_PORTS / VESSEL_REGION_PORTS
 *      (already covered by lib/__tests__/matching/mena-seed-matching.test.ts).
 *   2. Sweep mechanism in `analyzePairs` — pairs that pass hard filters but
 *      are not selected by the LLM still appear with score=25/weak.
 *      THIS file is the regression for layer 2.
 */

import { analyzePairs, type AiScorer } from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

function makeCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'cargo-demo-1',
    itemIndex: 0,
    originPort: { value: 'Iskenderun', confidence: 'confirmed' },
    originCountry: 'Turkey',
    destinationPort: { value: 'Rotterdam', confidence: 'interpreted' },
    destinationCountry: 'Netherlands',
    cargoDescription: { value: 'wheat in bulk', confidence: 'interpreted' },
    weightMt: { value: 30000, confidence: 'interpreted' },
    weightMtMin: 28000,
    weightMtMax: 32000,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: '15-25 May 2026',
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    ...overrides,
  };
}

function makeVessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'vessel-demo-1',
    itemIndex: 0,
    vesselName: { value: 'MV ATLANTIC TRADER', confidence: 'confirmed' },
    imo: '9123456',
    flag: 'Marshall Islands',
    built: 2015,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: 35000, confidence: 'confirmed' },
    dwcc: { value: 33000, confidence: 'interpreted' },
    draftMax: { value: 11.5, confidence: 'interpreted' },
    loa: 180,
    beam: null,
    grt: null,
    nrt: null,
    holdsCount: 5,
    hatchesCount: 5,
    grainCapacity: 1500000,
    grainCapacityUnit: 'cbft',
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: true,
    craneCapacity: '30',
    hatchType: null,
    vesselType: 'BULK',
    openPosition: { value: 'Piraeus', confidence: 'interpreted' },
    openDate: { value: '10 May 2026', confidence: 'interpreted' },
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '13',
    speedBallast: '14',
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
    ...overrides,
  };
}

describe('β-09 regression: matching pipeline returns > 0 matches on demo data', () => {
  it('returns ≥ 1 match when AI scorer is offline (sweep fallback)', async () => {
    const cargos = [makeCargo()];
    const vessels = [makeVessel()];
    // Offline / no-key AI scorer — returns [] (the failure mode that produced
    // "0 matches" in the Wave α E2E review).
    const offlineScorer: AiScorer = jest.fn().mockResolvedValue([]);

    const today = new Date('2026-04-30T00:00:00Z');
    const result = await analyzePairs(cargos, vessels, offlineScorer, {
      refYear: 2026,
      today,
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].cargoEmailId).toBe('cargo-demo-1');
    expect(result.matches[0].vesselEmailId).toBe('vessel-demo-1');
    // Sweep matches are weak by default — that's expected.
    expect(['weak', 'possible', 'good']).toContain(result.matches[0].matchLevel);
  });

  it('returns ≥ 1 match when AI scorer returns matches (LLM path)', async () => {
    const cargos = [makeCargo()];
    const vessels = [makeVessel()];
    const aiScorer: AiScorer = jest.fn().mockResolvedValue([
      {
        cargo_email_id: 'cargo-demo-1',
        cargo_item_index: 0,
        vessel_email_id: 'vessel-demo-1',
        vessel_item_index: 0,
        score: 78,
        match_level: 'good',
        match_reasons: ['DWT fits cargo', 'open position close to load port'],
      },
    ]);

    const result = await analyzePairs(cargos, vessels, aiScorer, {
      refYear: 2026,
      today: new Date('2026-04-30T00:00:00Z'),
    });
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it('returns 3 matches for 3 cargoes × 1 vessel that pass hard filters (sweep)', async () => {
    const cargos = [
      makeCargo({ emailId: 'c-A' }),
      makeCargo({ emailId: 'c-B' }),
      makeCargo({ emailId: 'c-C' }),
    ];
    const vessels = [makeVessel()];
    const offlineScorer: AiScorer = jest.fn().mockResolvedValue([]);

    const result = await analyzePairs(cargos, vessels, offlineScorer, {
      refYear: 2026,
      today: new Date('2026-04-30T00:00:00Z'),
    });
    expect(result.matches.length).toBe(3);
  });
});
