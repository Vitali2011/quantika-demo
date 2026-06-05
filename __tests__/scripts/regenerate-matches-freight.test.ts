/**
 * Behavioral tests for Task 6 (#819): seed persists freight_rate_usd_per_mt + freight_rate_source.
 * Tests buildMatchEconomics returns the freight fields so writeBucket can persist them.
 */
import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import migration044 from '@/lib/migrations/044-matches-item-index';
import migration045 from '@/lib/migrations/045-matches-worksheet';
import { buildMatchEconomics } from '@/lib/matching/tce-calculator';
import { listMatches, createMatch } from '@/lib/matching/matches-repository';

function freshDb(): Database.Database {
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
  return db;
}

describe('buildMatchEconomics — freight rate persisted for seed (#819 Task 6)', () => {
  test('returns freightRateUsdPerMt and freightRateSource alongside tceUsdPerDay', () => {
    const result = buildMatchEconomics({
      cargoType: 'GRAIN',
      distanceNm: 400,
      vesselDwt: 3000,
      quantityMt: 2500,
      speedKts: 12,
      consumptionMt: 8,
      loadPort: 'marmara',
      dischargePort: 'constanta',
      calculatedAt: new Date(0).toISOString(),
      resolvedFreight: { rate: 25.2, source: 'estimated', confidence: 0.6 },
    });
    expect(result).not.toBeNull();
    expect(result!.freightRateUsdPerMt).toBe(25.2);
    expect(result!.freightRateSource).toBe('estimated');
    expect(result!.tceUsdPerDay).toBeGreaterThan(0);
  });

  test('persisted match row has non-null freight_rate_usd_per_mt via createMatch', () => {
    const db = freshDb();
    try {
      createMatch(db, {
        cargo_id: 'cargo-1', vessel_id: 'vessel-1', cargo_item_index: 0, vessel_item_index: 0,
        score: 80, reason: 'test', status: 'shortlist', user_id: null,
        tce_usd_per_day: 1234, distance_nm: 400,
        freight_rate_usd_per_mt: 25.2, freight_rate_source: 'estimated',
        vessel_name: null, cargo_ref: null, fit_percent: null, fit_breakdown: null,
      });
      const rows = listMatches(db, { user_id: null, sortBy: 'score', sortDir: 'desc' });
      expect(rows).toHaveLength(1);
      expect(rows[0].freight_rate_usd_per_mt).toBe(25.2);
      expect(rows[0].freight_rate_source).toBe('estimated');
    } finally {
      db.close();
    }
  });
});
