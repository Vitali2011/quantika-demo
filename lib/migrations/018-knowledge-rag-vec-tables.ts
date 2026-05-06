/**
 * Migration 018: Knowledge RAG vec0 + FTS5 tables
 *
 * Creates vector search tables (vec0) and full-text search tables (FTS5)
 * for IMSBC Code, IGC Grain Code, and JWC Listed Areas.
 *
 * Vec0 tables: used for semantic similarity search (cosine k-NN)
 * FTS5 tables: used for BM25 keyword search (regulatory terms)
 *
 * Hybrid retrieval: vec0 cosine + FTS5 BM25 + Reciprocal Rank Fusion
 */

import type { Migration } from './types';

const migration018: Migration = {
  version: 18,
  name: 'knowledge-rag-vec-tables',
  up(db) {
    // Vec0 virtual tables for semantic search (sqlite-vec)
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

    // FTS5 virtual tables for keyword search (BM25 ranking)
    db.exec(`
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
    // Drop FTS5 tables
    db.exec(`
      DROP TABLE IF EXISTS jwc_fts;
      DROP TABLE IF EXISTS igc_fts;
      DROP TABLE IF EXISTS imsbc_fts;
    `);

    // Drop vec0 tables
    db.exec(`
      DROP TABLE IF EXISTS jwc_vec;
      DROP TABLE IF EXISTS igc_vec;
      DROP TABLE IF EXISTS imsbc_vec;
    `);
  },
};

export default migration018;
