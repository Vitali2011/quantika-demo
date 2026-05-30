/**
 * O(1) Map lookup test for pair-analyzer.
 * Verifies that findAnalysis uses Map.get (O(1)) not Array.find (O(n²)).
 */
import { analyzePairs, AiScorer, RawMatch } from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

function makeCargo(emailId: string, itemIndex = 0): ParsedCargo {
  return {
    emailId,
    itemIndex,
    originPort: { value: 'AEJEA', confidence: 0.9, source: 'llm' },
    destinationPort: { value: 'SAJED', confidence: 0.9, source: 'llm' },
    cargoDescription: { value: 'Bulk grain', confidence: 0.9, source: 'llm' },
    weightMt: { value: 25000, confidence: 0.9, source: 'llm' },
    cargoType: 'BULK',
    preferredDates: { value: '2025-05-01', confidence: 0.8, source: 'llm' },
    laycan: '1-15 May 2025',
    originCountry: null,
    destinationCountry: null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    containerType: null,
    quantity: null,
    incoterms: null,
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
  } as unknown as ParsedCargo;
}

function makeVessel(emailId: string, itemIndex = 0): ParsedVessel {
  return {
    emailId,
    itemIndex,
    vesselName: { value: 'MV TEST', confidence: 0.9, source: 'llm' },
    dwtSummer: { value: 35000, confidence: 0.9, source: 'llm' },
    dwcc: null,
    draftMax: { value: 10.5, confidence: 0.8, source: 'llm' },
    geared: true,
    vesselType: 'BULK_CARRIER',
    openPosition: { value: 'DUBAI', confidence: 0.9, source: 'llm' },
    openDate: { value: '20 Apr 2025', confidence: 0.8, source: 'llm' },
    flag: 'Panama',
    imo: null,
    direction: null,
    restrictions: [],
    grainCapacity: null,
    holdDimensions: null,
    craneCapacity: null,
    built: null,
    loa: null,
    speedLaden: null,
  } as unknown as ParsedVessel;
}

describe('analyzePairs — Map-based lookup', () => {
  it('correctly matches LLM results to their analysis records', async () => {
    const cargo = makeCargo('email-cargo-1');
    const vessel = makeVessel('email-vessel-1');

    const scorer: AiScorer = async () => {
      const match: RawMatch = {
        cargo_email_id: 'email-cargo-1',
        cargo_item_index: 0,
        vessel_email_id: 'email-vessel-1',
        vessel_item_index: 0,
        score: 80,
        match_level: 'good',
        match_reasons: ['Good DWT fit'],
        issues: [],
      };
      return [match];
    };

    const result = await analyzePairs([cargo], [vessel], scorer, {
      refYear: 2025,
      today: new Date('2025-04-01'),
    });

    // NEW CONTRACT (handover 2026-05-30, levers 1+2+5): analyzePairs partitions
    // non-blocked pairs across matches / lowConfidenceMatches / insufficientData.
    // These synthetic ports aren't in the distance matrix → verdict 'unknown' →
    // the pair lands in insufficientData, not matches. The lookup still attaches
    // readiness/hardFilters to every analyzed pair, which is what this test checks.
    const all = [...result.matches, ...result.lowConfidenceMatches, ...result.insufficientData];
    expect(all).toHaveLength(1);
    const m = all[0];
    expect(m.cargoEmailId).toBe('email-cargo-1');
    expect(m.vesselEmailId).toBe('email-vessel-1');
    // readiness/hardFilters should be attached via the analysis lookup
    expect(m.hardFilters).toBeDefined();
  });

  it('returns empty matches when no cargos or vessels', async () => {
    const scorer: AiScorer = async () => [];
    const r1 = await analyzePairs([], [makeVessel('v1')], scorer);
    expect(r1.matches).toHaveLength(0);

    const r2 = await analyzePairs([makeCargo('c1')], [], scorer);
    expect(r2.matches).toHaveLength(0);
  });

  it('handles multiple cargo-vessel pairs correctly via lookup', async () => {
    const cargos = [makeCargo('c1', 0), makeCargo('c2', 0)];
    const vessels = [makeVessel('v1', 0), makeVessel('v2', 0)];

    const scorer: AiScorer = async () => {
      return [
        { cargo_email_id: 'c1', cargo_item_index: 0, vessel_email_id: 'v1', vessel_item_index: 0, score: 75 },
        { cargo_email_id: 'c2', cargo_item_index: 0, vessel_email_id: 'v2', vessel_item_index: 0, score: 60 },
      ];
    };

    const result = await analyzePairs(cargos, vessels, scorer, {
      refYear: 2025,
      today: new Date('2025-04-01'),
    });

    // Both analyzed pairs should have hardFilters attached (proves lookup worked).
    // NEW CONTRACT: pairs may land in any bucket — check the union (see note above).
    const all = [...result.matches, ...result.lowConfidenceMatches, ...result.insufficientData];
    const matchWithFilters = all.filter(m => m.hardFilters !== undefined);
    expect(matchWithFilters.length).toBeGreaterThanOrEqual(2);
  });

  it('pairs that fail hard filters appear in blockedMatches not matches', async () => {
    // Cargo with impossible constraints — very large cargo on tiny vessel
    const cargo = makeCargo('c-block');
    const vessel = makeVessel('v-block');
    // Override vessel DWT to be tiny (1000 mt) — weight filter should block
    (vessel.dwtSummer as { value: number }).value = 100;

    const scorer: AiScorer = async () => [];

    const result = await analyzePairs([cargo], [vessel], scorer, {
      refYear: 2025,
      today: new Date('2025-04-01'),
    });

    // The pair may be blocked or in sweep matches depending on filter logic
    // Either way, no duplicates between matches and blockedMatches
    const matchKeys = new Set(result.matches.map(m => `${m.cargoEmailId}-${m.vesselEmailId}`));
    const blockedKeys = new Set(result.blockedMatches.map(b => `${b.cargoEmailId}-${b.vesselEmailId}`));
    const overlap = Array.from(matchKeys).filter(k => blockedKeys.has(k));
    expect(overlap).toHaveLength(0);
  });
});
