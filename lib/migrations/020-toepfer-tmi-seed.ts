import type { Migration } from './types';
import type Database from 'better-sqlite3';

const migration020: Migration = {
  version: 20,
  name: 'toepfer-tmi-seed',
  up(db: Database.Database): void {
    // Requires migration019 to have run first (baltic_indices table must exist)
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO baltic_indices (index_code, value, price_date, source)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run('TOEPFER_TMI', 12683, '2026-05-09', 'static-seed');
    // Re-seed BHSI in case it wasn't seeded by the knowledge-baltic-seed.ts script
    stmt.run('BHSI', 650, '2026-05-09', 'static-seed');
    stmt.run('BDI', 1450, '2026-05-09', 'static-seed');
    stmt.run('BCI', 1600, '2026-05-09', 'static-seed');
    stmt.run('BSI', 1100, '2026-05-09', 'static-seed');
  },
  down(db: Database.Database): void {
    db.exec(`DELETE FROM baltic_indices WHERE source = 'static-seed'`);
  },
};

export default migration020;
