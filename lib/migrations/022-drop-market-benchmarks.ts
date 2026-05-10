import type { Migration } from './types';

const migration022: Migration = {
  version: 22,
  name: 'drop-market-benchmarks',
  up(db) {
    db.exec(`DROP TABLE IF EXISTS market_benchmarks;`);
  },
  down(_db) {
    // intentionally empty — dead table is not restored
  },
};

export default migration022;
