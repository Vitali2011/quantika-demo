/**
 * Unit tests — baltic-freight.ts (Wave #7, L2 #7, tier-2)
 *
 * DB-bound helpers that resolve a per-vessel-class Baltic timecharter DAY-RATE
 * ($/day) from `baltic_indices`, which resolveFreightRate turns into $/mt.
 * The day-rate rows are a static, dated seed (migration 043) distinct from the
 * index-POINTS rows (BHSI/BSI/…), which are a different unit.
 */

import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import migration043 from '@/lib/migrations/043-baltic-tc-dayrates-seed';
import { balticIndexCodeForDwt, getBalticDayRate } from '@/lib/market/baltic-freight';

describe('balticIndexCodeForDwt', () => {
  it('handysize/handymax (<45000) → BHSI_TC', () => {
    expect(balticIndexCodeForDwt(20000)).toBe('BHSI_TC');
    expect(balticIndexCodeForDwt(44999)).toBe('BHSI_TC');
  });
  it('supramax/ultramax (45000–69999) → BSI_TC', () => {
    expect(balticIndexCodeForDwt(45000)).toBe('BSI_TC');
    expect(balticIndexCodeForDwt(69999)).toBe('BSI_TC');
  });
  it('panamax+ (>=70000) → BPI_TC', () => {
    expect(balticIndexCodeForDwt(70000)).toBe('BPI_TC');
    expect(balticIndexCodeForDwt(180000)).toBe('BPI_TC');
  });
});

describe('getBalticDayRate', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    migration019.up(db);
    migration043.up(db);
  });
  afterEach(() => db.close());

  it('returns the seeded $/day rate for the vessel class (supramax → BSI_TC)', () => {
    const r = getBalticDayRate(db, 50000);
    expect(r).not.toBeNull();
    expect(r!.indexCode).toBe('BSI_TC');
    expect(r!.usdPerDay).toBe(13500);
    expect(r!.date).toBe('2026-05-09');
  });

  it('handysize → BHSI_TC 11500', () => {
    expect(getBalticDayRate(db, 30000)!.usdPerDay).toBe(11500);
  });

  it('panamax → BPI_TC 15000', () => {
    expect(getBalticDayRate(db, 80000)!.usdPerDay).toBe(15000);
  });

  it('panamax falls back to BSI_TC when BPI_TC is absent', () => {
    db.prepare(`DELETE FROM baltic_indices WHERE index_code='BPI_TC'`).run();
    const r = getBalticDayRate(db, 80000);
    expect(r!.indexCode).toBe('BSI_TC');
    expect(r!.usdPerDay).toBe(13500);
  });

  it('returns null when the baltic_indices table is absent (defensive)', () => {
    const bare = new Database(':memory:');
    expect(getBalticDayRate(bare, 50000)).toBeNull();
    bare.close();
  });

  it('returns null when no day-rate row matches', () => {
    db.prepare(`DELETE FROM baltic_indices`).run();
    expect(getBalticDayRate(db, 50000)).toBeNull();
  });
});
