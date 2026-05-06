import type { Migration } from './types';

const migration018: Migration = {
  version: 18,
  name: 'knowledge-rag-vec-tables',
  up(db) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS imsbc_vec USING vec0(
        embedding FLOAT[768],
        content TEXT,
        metadata TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS igc_vec USING vec0(
        embedding FLOAT[768],
        content TEXT,
        metadata TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS jwc_vec USING vec0(
        embedding FLOAT[768],
        content TEXT,
        metadata TEXT
      );
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS jwc_vec;
      DROP TABLE IF EXISTS igc_vec;
      DROP TABLE IF EXISTS imsbc_vec;
    `);
  },
};

export default migration018;
