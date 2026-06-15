/**
 * #1002 AC-1002c / epic #1004 AC-E3 — bunker-source parity lock.
 *
 * The stored LIST/fit TCE and the live Voyage-P&L TCE must consume the SAME
 * live NLRTM/VLSFO bunker price (DEFAULT_BUNKER_USD_PER_MT=600 is only the
 * empty-table fallback). This regression test pins that contract so a future
 * route-aware bunker-port change (the real #1002 ask) is a deliberate, tested
 * migration — not an accidental divergence from the headline "one number".
 */
import Database from 'better-sqlite3';
import { allMigrations } from '@/lib/migrations/index';
import { runMigrations } from '@/lib/migrations/runner';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';

function fixture() {
  const cargo = {
    emailId: 'c1', itemIndex: 0,
    originPort: { value: 'Odessa', confidence: 'confirmed', source_text: 'Odessa' },
    destinationPort: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
    cargoType: 'GRAIN', freightRateUsd: 30,
    weightMt: { value: 52000, confidence: 'confirmed', source_text: '52000' },
  } as never;
  const vessel = {
    emailId: 'v1', itemIndex: 0,
    dwtSummer: { value: 56000, confidence: 'confirmed', source_text: '56000' },
    speedLaden: '13', consumption: '28',
    openPosition: { value: 'Piraeus', confidence: 'confirmed', source_text: 'Piraeus' },
  } as never;
  return { cargo, vessel };
}

describe('stored-match-economics — bunker source parity (#1002 / #1004)', () => {
  it('consumes the supplied live NLRTM price, not the 600 fallback', () => {
    const db = new Database(':memory:');
    runMigrations(db, allMigrations);
    const { cargo, vessel } = fixture();
    const res = computeStoredMatchEconomics({ cargo, vessel, db, bunkerPriceUsdPerMt: 791 });
    expect(res.tce_breakdown).not.toBeNull();
    expect(res.tce_breakdown!.bunker_price_usd_per_mt).toBe(791);
    db.close();
  });

  it('falls back to the 600 default only when no live price is supplied', () => {
    const db = new Database(':memory:');
    runMigrations(db, allMigrations);
    const { cargo, vessel } = fixture();
    const res = computeStoredMatchEconomics({ cargo, vessel, db });
    expect(res.tce_breakdown).not.toBeNull();
    expect(res.tce_breakdown!.bunker_price_usd_per_mt).toBe(600);
    db.close();
  });
});
