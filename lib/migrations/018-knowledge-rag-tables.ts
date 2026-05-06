import type { Migration } from './types';

const migration018: Migration = {
  version: 18,
  name: 'knowledge-rag-tables',
  up(db) {
    db.exec(`
      -- Vec0 virtual tables for semantic search (768-dimensional embeddings from Vertex AI text-multilingual-embedding-002)
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

      -- FTS5 virtual tables for BM25 keyword search
      CREATE VIRTUAL TABLE IF NOT EXISTS imsbc_fts USING fts5(
        content,
        metadata,
        tokenize='unicode61 remove_diacritics 1'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS igc_fts USING fts5(
        content,
        metadata,
        tokenize='unicode61 remove_diacritics 1'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS jwc_fts USING fts5(
        content,
        metadata,
        tokenize='unicode61 remove_diacritics 1'
      );
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS jwc_fts;
      DROP TABLE IF EXISTS igc_fts;
      DROP TABLE IF EXISTS imsbc_fts;
      DROP TABLE IF EXISTS jwc_vec;
      DROP TABLE IF EXISTS igc_vec;
      DROP TABLE IF EXISTS imsbc_vec;
    `);
  },
};

export default migration018;
