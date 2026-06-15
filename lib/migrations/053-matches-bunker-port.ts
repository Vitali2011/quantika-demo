import type { Migration } from './types';

/**
 * matches.bunker_port — LOCODE of the route-aware bunker port used to compute
 * the stored tce_usd_per_day (#1002). The detail page (EconomicsTab) seeds its
 * bunker selector from this value so list TCE and detail TCE use the same port.
 * Nullable: old rows (and non-Med routes resolving to the NLRTM fallback) read
 * back as null and EconomicsTab applies `?? 'NLRTM'` — no disruption.
 */
const migration053: Migration = {
  version: 53,
  name: 'matches-bunker-port',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'bunker_port')) {
      db.exec(`ALTER TABLE matches ADD COLUMN bunker_port TEXT`);
    }
  },
  down(db) {
    void db;
  },
};

export default migration053;
