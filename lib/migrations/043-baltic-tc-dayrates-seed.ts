import type { Migration } from './types';
import type Database from 'better-sqlite3';

/**
 * Migration 043: per-vessel-class Baltic timecharter DAY-RATE seed (Wave #7, L2 #7).
 *
 * The tier-2 freight waterfall computes $/mt = ($/day × voyage days) ÷ tonnes, so it
 * needs a real $/day figure per vessel class. The existing index-POINTS rows
 * (BHSI=650, BSI=1100, …) are a different unit (typed `unit:'index'` for KPI display)
 * and must NOT be repurposed. These distinct `*_TC` codes hold the timecharter-average
 * $/day rates, anchored to TOEPFER_TMI≈12,683 $/day (handysize MPP) for 2026-05-09.
 *
 * Static, dated seed — a live Baltic feed is L4 / out of scope. INSERT OR IGNORE so
 * re-running on a DB that already has these rows is a no-op.
 */
const migration043: Migration = {
  version: 43,
  name: 'baltic-tc-dayrates-seed',
  up(db: Database.Database): void {
    // Requires migration 019 (baltic_indices table).
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO baltic_indices (index_code, value, price_date, source)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run('BHSI_TC', 11500, '2026-05-09', 'static-seed'); // handysize / handymax
    stmt.run('BSI_TC', 13500, '2026-05-09', 'static-seed'); // supramax / ultramax
    stmt.run('BPI_TC', 15000, '2026-05-09', 'static-seed'); // panamax+
  },
  down(db: Database.Database): void {
    db.exec(
      `DELETE FROM baltic_indices WHERE index_code IN ('BHSI_TC','BSI_TC','BPI_TC') AND source = 'static-seed'`,
    );
  },
};

export default migration043;
