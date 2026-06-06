import { analyzePairs } from '@/lib/matching/pair-analyzer';
import { buildMatchEconomics } from '@/lib/matching/tce-calculator';
import { getPortDistance } from '@/lib/sailing/port-distances';
import type { BlockedMatch, CargoType, Match, ParsedCargo, ParsedVessel } from '@/lib/types';
import type { GoldenRecord } from './schema';

export interface GoldenActual {
  distanceNm: number | null;
  weightMt: number | null;
  tceUsdPerDay: number | null;
  bucket: 'main' | 'review' | 'insufficient' | 'blocked' | 'none';
  matchLevel: string | null;
  score: number | null;
  reason: string | null;
}

const cf = <T>(v: T) =>
  v == null ? null : ({ value: v, confidence: 'confirmed' as const });

export function buildCargo(c: GoldenRecord['inputs']['cargo']): ParsedCargo {
  return {
    emailId: c.ref,
    itemIndex: 0,
    originPort: cf(c.loadPort),
    originCountry: c.loadCountry ?? null,
    destinationPort: cf(c.dischPort),
    destinationCountry: c.dischCountry ?? null,
    cargoDescription: null,
    weightMt: cf(c.qtyT),
    weightMtMin: c.qtyMinT ?? c.qtyT,
    weightMtMax: c.qtyMaxT ?? c.qtyT,
    volumeCbm: c.volumeCbm ?? null,
    dimensions: null,
    cargoType: (c.cargoType ?? 'BULK') as CargoType,
    containerType: null,
    quantity: c.qtyT,
    incoterms: null,
    preferredDates: null,
    laycan: `${c.laycanStart} .. ${c.laycanEnd}`,
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: c.stowageFactor != null ? String(c.stowageFactor) : null,
    missingInfo: [],
    // Broker-verified freight rate — feeds resolvedFreight tier-1 in pair-analyzer and fallback buildMatchEconomics
    freightRateUsd: c.freightRateUsdPerMt ?? null,
  };
}

export function buildVessel(v: GoldenRecord['inputs']['vessel']): ParsedVessel {
  return {
    emailId: v.name,
    itemIndex: 0,
    vesselName: cf(v.name),
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    dwtSummer: cf(v.dwt),
    dwcc: v.dwccT != null ? cf(v.dwccT) : null,
    draftMax: v.draftMaxM != null ? cf(v.draftMaxM) : null,
    loa: null,
    beam: null,
    grt: null,
    nrt: null,
    holdsCount: null,
    hatchesCount: null,
    grainCapacity: v.grainCapacityCbm ?? null,
    grainCapacityUnit: v.grainCapacityCbm != null ? 'cbm' : null,
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: v.geared ?? false,
    craneCapacity: v.craneCapacityT != null ? `${v.craneCapacityT} MT` : null,
    hatchType: null,
    vesselType: 'Bulk Carrier',
    openPosition: cf(v.openPort),
    openDate: { value: v.openDate, confidence: 'confirmed' },
    direction: null,
    restrictions: v.restrictions ?? [],
    lastCargoes: null,
    speedLaden: v.speedKn != null ? String(v.speedKn) : null,
    speedBallast: null,
    consumption: v.consumptionT != null ? `${v.consumptionT} mt` : null,
    deckCapacity: null,
    specialFeatures: [],
    ciiRating: null,
    verificationWarning: null,
  };
}

export async function runGolden(r: GoldenRecord, today: Date): Promise<GoldenActual> {
  const cargo = buildCargo(r.inputs.cargo);
  const vessel = buildVessel(r.inputs.vessel);
  const res = await analyzePairs([cargo], [vessel], async () => [], { today });

  const findMatch = (arr: Match[]) =>
    arr.find((m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === vessel.emailId);
  const findBlocked = (arr: BlockedMatch[]) =>
    arr.find((m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === vessel.emailId);

  const mainMatch = findMatch(res.matches);
  const reviewMatch = findMatch(res.lowConfidenceMatches);
  const insufficientMatch = findMatch(res.insufficientData);
  const blockedMatch = findBlocked(res.blockedMatches);

  const m: Match | null = mainMatch ?? reviewMatch ?? insufficientMatch ?? null;
  const bucket: GoldenActual['bucket'] = mainMatch
    ? 'main'
    : reviewMatch
    ? 'review'
    : insufficientMatch
    ? 'insufficient'
    : blockedMatch
    ? 'blocked'
    : 'none';

  // laden distance (loadPort → dischPort) — same source pair-analyzer uses for economics
  const ladenDist =
    getPortDistance(r.inputs.cargo.loadPort, r.inputs.cargo.dischPort)?.nm ?? 0;

  const verifiedFreight = r.inputs.cargo.freightRateUsdPerMt;
  const econ = m?.economics ?? buildMatchEconomics({
    cargoType: r.inputs.cargo.cargoType ?? 'BULK',
    distanceNm: ladenDist,
    vesselDwt: r.inputs.vessel.dwt ?? 0,
    quantityMt: r.inputs.cargo.qtyT ?? 0,
    speedKts: r.inputs.vessel.speedKn ?? 12,
    consumptionMt: r.inputs.vessel.consumptionT ?? 25,
    loadPort: r.inputs.cargo.loadPort,
    dischargePort: r.inputs.cargo.dischPort,
    vesselOpenPosition: r.inputs.vessel.openPort,
    calculatedAt: today.toISOString(),
    resolvedFreight: verifiedFreight != null
      ? { rate: verifiedFreight, source: 'manual', confidence: 1 }
      : undefined,
  });

  return {
    distanceNm: ladenDist > 0 ? ladenDist : null,
    weightMt: r.inputs.cargo.qtyT,
    tceUsdPerDay: econ?.tceUsdPerDay ?? null,
    bucket,
    matchLevel: m?.matchLevel ?? null,
    score: m?.score ?? null,
    reason: blockedMatch?.filterReason ?? m?.issues?.[0] ?? m?.matchReasons?.[0] ?? null,
  };
}
