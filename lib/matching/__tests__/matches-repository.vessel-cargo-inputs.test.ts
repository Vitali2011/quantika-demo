import Database from 'better-sqlite3';
import { allMigrations } from '@/lib/migrations/index';
import { runMigrations } from '@/lib/migrations/runner';
import { createMatch, getMatch } from '@/lib/matching/matches-repository';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

describe('matches-repository — vessel/cargo TCE input columns (migration 052)', () => {
  it('round-trips vessel_open_position / vessel_speed_kts / vessel_consumption_mt_per_day / cargo_quantity_mt', () => {
    const db = freshDb();
    const m = createMatch(db, {
      cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'x', user_id: 'sid',
      vessel_open_position: 'Piraeus', vessel_speed_kts: 13.5,
      vessel_consumption_mt_per_day: 28.2, cargo_quantity_mt: 52000,
    });
    const row = getMatch(db, m.id)!;
    expect(row.vessel_open_position).toBe('Piraeus');
    expect(row.vessel_speed_kts).toBe(13.5);
    expect(row.vessel_consumption_mt_per_day).toBe(28.2);
    expect(row.cargo_quantity_mt).toBe(52000);
    db.close();
  });

  it('refreshComputed updates the 4 columns in place on duplicate insert', () => {
    const db = freshDb();
    const a = createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'x', user_id: 'sid', vessel_speed_kts: 12 });
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'x', user_id: 'sid', vessel_speed_kts: 14, refreshComputed: true });
    expect(getMatch(db, a.id)!.vessel_speed_kts).toBe(14);
    db.close();
  });
});
