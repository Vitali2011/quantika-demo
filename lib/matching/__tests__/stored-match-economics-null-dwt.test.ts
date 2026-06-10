/**
 * Behavioral test: null/unparseable vessel DWT must not anchor to Handysize Baltic tier.
 *
 * Root cause: stored-match-economics.ts previously called getBalticDayRate(db, 0) when
 * dwtSummer was absent, which returned a positive BHSI_TC rate (Handysize) and caused
 * freight_rate_source='baltic' for vessels of unknown class (#null-dwt-baltic).
 *
 * Fix: gate the Baltic lookup on ecoDwt > 0; unknown-DWT vessels fall to the
 * class-neutral tier-3 estimate (dwtFactor(0)=1.0, confidence=0.3).
 */

import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import migration043 from '@/lib/migrations/043-baltic-tc-dayrates-seed';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';

/** In-memory DB with baltic_indices seeded so tier-2 would fire on a valid DWT. */
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration019.up(db);
  migration043.up(db);
  // port_da_estimates must exist; rows absent means DA=0 (valid for this test).
  db.exec(`
    CREATE TABLE port_da_estimates (
      port_code TEXT, vessel_dwt_min INTEGER, vessel_dwt_max INTEGER,
      port_dues_usd REAL, pilotage_usd REAL, tugs_usd REAL,
      stevedoring_usd_per_mt REAL DEFAULT 0, cargo_type TEXT DEFAULT 'general',
      confidence TEXT DEFAULT 'estimated', source TEXT DEFAULT 'test'
    )
  `);
  return db;
}

// Panamax-scale cargo, no stated rate → tier-1 (parsed) skipped so tier-2/3 determines source.
const CARGO: any = {
  emailId: 'c-null-dwt-test',
  itemIndex: 0,
  originPort: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
  destinationPort: { value: 'Singapore', confidence: 'confirmed', source_text: 'Singapore' },
  cargoType: { value: 'GRAIN', confidence: 'confirmed', source_text: 'grain' },
  freightRateUsd: null,
  weightMt: { value: 65000, confidence: 'confirmed', source_text: '65000' },
};

describe('computeStoredMatchEconomics — null/unparseable DWT → skip Baltic tier', () => {
  it('dwtSummer=null skips Baltic tier-2, falls through to tier-3 estimated', () => {
    const db = makeDb();

    const vessel: any = {
      emailId: 'v-null-dwt',
      itemIndex: 0,
      dwtSummer: null, // absent → cfValue returns null → ecoDwt=0
      speedLaden: '13',
      consumption: '26',
      openPosition: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
    };

    const res = computeStoredMatchEconomics({ cargo: CARGO, vessel, db });

    expect(res.freight_rate_source).not.toBe('baltic'); // tier-2 must be skipped when class unknown
    expect(res.freight_rate_source).toBe('estimated');  // falls through to class-neutral tier-3
    expect(res.tce_usd_per_day).not.toBeNull();         // still produces a valid TCE

    db.close();
  });

  it('dwtSummer=82000 (Panamax) still resolves Baltic tier-2 — no over-correction', () => {
    const db = makeDb();

    const vessel: any = {
      emailId: 'v-panamax',
      itemIndex: 0,
      dwtSummer: { value: 82000, confidence: 'confirmed', source_text: '82000' },
      speedLaden: '13',
      consumption: '26',
      openPosition: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
    };

    const res = computeStoredMatchEconomics({ cargo: CARGO, vessel, db });

    expect(res.freight_rate_source).toBe('baltic'); // gate passes → BPI_TC day-rate used

    db.close();
  });
});
