/**
 * Synthetic economics-matching fixtures: a guaranteed cargo+vessel pair used
 * by the EconomicsTab demo. Not part of the ETMS corpus; preserved here so
 * regenerating lib/sample-data from real emails (scripts/build-sample-data.ts)
 * doesn't break the economics demo.
 *
 * The two records carry +Nd / +0d offsets so the demo always shows them with
 * a future laycan and a fresh openDate relative to seed time.
 */

import type { ParsedCargo, ParsedVessel } from '@/lib/types';

const SYNTHETIC_CARGO_BASE: Omit<ParsedCargo, 'laycan'> & {
  laycanRelativeStart: string;
  laycanRelativeEnd: string;
} = {
  emailId: 'demo-cargo-economics',
  itemIndex: 0,
  originPort: { value: 'CNSHA', confidence: 'confirmed', sourceText: 'Load: Shanghai, China' },
  originCountry: 'China',
  destinationPort: { value: 'NLRTM', confidence: 'confirmed', sourceText: 'Disch: Rotterdam, Netherlands' },
  destinationCountry: 'Netherlands',
  cargoDescription: { value: 'Grain', confidence: 'confirmed', sourceText: '50,000 mts Grain' },
  weightMt: { value: 50000, confidence: 'confirmed', sourceText: '50,000 mts Grain' },
  weightMtMin: 50000,
  weightMtMax: 50000,
  volumeCbm: null,
  dimensions: null,
  cargoType: 'BULK',
  containerType: null,
  quantity: 50000,
  incoterms: 'FIOST',
  preferredDates: null,
  laycanRelativeStart: '+180d',
  laycanRelativeEnd: '+200d',
  loadingRate: '10000 mts SHINC',
  dischargeRate: '10000 mts SHINC',
  commissionPercent: 3.75,
  commissionTerms: 'TTL',
  specialRequirements: null,
  stowageFactor: '1.25',
  missingInfo: [],
};

const SYNTHETIC_VESSEL_BASE: Omit<ParsedVessel, 'openDate'> & {
  openDateRelative: string;
} = {
  emailId: 'demo-vessel-economics',
  itemIndex: 0,
  vesselName: { value: 'DEMO ECONOMICS', confidence: 'confirmed' },
  imo: '9999991',
  flag: 'Marshall Islands',
  built: 2015,
  classSociety: 'DNV',
  pandi: 'Gard',
  dwtSummer: { value: 58000, confidence: 'confirmed' },
  dwcc: { value: 55500, confidence: 'confirmed' },
  draftMax: { value: 12.5, confidence: 'confirmed' },
  loa: 189.9,
  beam: 32.2,
  grt: null,
  nrt: null,
  holdsCount: 5,
  hatchesCount: 5,
  grainCapacity: null,
  grainCapacityUnit: null,
  baleCapacity: 72000,
  holdDimensions: null,
  hatchDimensions: null,
  tankTopStrength: null,
  geared: false,
  craneCapacity: null,
  hatchType: null,
  vesselType: 'Bulk Carrier',
  openPosition: { value: 'Singapore', confidence: 'confirmed' },
  direction: 'Worldwide',
  restrictions: [],
  lastCargoes: 'grain, bulk',
  speedLaden: '14.0',
  speedBallast: '14.5',
  consumption: '32.0 mt IFO',
  deckCapacity: null,
  specialFeatures: [],
  ciiRating: null,
  verificationWarning: null,
  openDateRelative: '+0d',
};

function addDaysIso(base: Date, offset: string): string {
  const match = /^\+(\d+)d$/.exec(offset);
  if (!match) throw new Error(`Invalid offset: "${offset}"`);
  const days = parseInt(match[1], 10);
  const result = new Date(base.getTime() + days * 86_400_000);
  return result.toISOString().slice(0, 10);
}

export function resolveSyntheticCargo(now: Date): ParsedCargo {
  const { laycanRelativeStart, laycanRelativeEnd, ...rest } = SYNTHETIC_CARGO_BASE;
  const start = addDaysIso(now, laycanRelativeStart);
  const end = addDaysIso(now, laycanRelativeEnd);
  return { ...rest, laycan: `${start} .. ${end}` };
}

export function resolveSyntheticVessel(now: Date): ParsedVessel {
  const { openDateRelative, ...rest } = SYNTHETIC_VESSEL_BASE;
  const resolved = addDaysIso(now, openDateRelative);
  return { ...rest, openDate: { value: resolved, confidence: 'confirmed' } };
}
