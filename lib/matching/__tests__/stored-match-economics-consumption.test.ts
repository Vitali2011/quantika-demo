import Database from 'better-sqlite3';
import { computeStoredMatchEconomics } from '../stored-match-economics';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import migration044 from '@/lib/migrations/044-matches-item-index';
import migration045 from '@/lib/migrations/045-matches-worksheet';
import migration046 from '@/lib/migrations/046-matches-consumption-estimated';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

function seedDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  migration044.up(db);
  migration045.up(db);
  migration046.up(db);
  return db;
}

const baseCargo: ParsedCargo = {
  emailId: 'c1',
  itemIndex: 0,
  cargoType: { value: 'GRAIN', confidence: 'confirmed' },
  originPort: { value: 'NLRTM', confidence: 'confirmed' },
  destinationPort: { value: 'EGPSD', confidence: 'confirmed' },
  freightRateUsd: null,
  weightMt: { value: 18000, confidence: 'confirmed' },
  preferredDates: null,
} as unknown as ParsedCargo;

const vesselWithNoConsumption: ParsedVessel = {
  emailId: 'v1',
  itemIndex: 0,
  dwtSummer: { value: 28000, confidence: 'confirmed' },
  speedLaden: { value: '12 knots', confidence: 'confirmed' },
  consumption: null,  // MISSING
  openPosition: { value: 'GRPIR', confidence: 'confirmed' },
} as unknown as ParsedVessel;

test('computeStoredMatchEconomics: null consumption → consumptionEstimated=true and economics present', () => {
  const db = seedDb();
  const result = computeStoredMatchEconomics({ cargo: baseCargo, vessel: vesselWithNoConsumption, db });
  expect(result.consumption_estimated).toBe(true);
  expect(result.tce_usd_per_day).not.toBeNull();
  // TCE should be defined and sensible (class-aware consumption, not 0-bunker inflated)
  expect(result.economics?.consumptionEstimated).toBe(true);
});

test('computeStoredMatchEconomics: explicit consumption → consumptionEstimated=false', () => {
  const db = seedDb();
  const vesselWithCons = { ...vesselWithNoConsumption, consumption: { value: '22 mt/day', confidence: 'confirmed' as const } };
  const result = computeStoredMatchEconomics({ cargo: baseCargo, vessel: vesselWithCons, db });
  expect(result.consumption_estimated).toBeFalsy();
  expect(result.tce_usd_per_day).not.toBeNull();
});
