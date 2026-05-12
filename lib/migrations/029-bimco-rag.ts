/**
 * Migration 029: BIMCO RAG vec0 + FTS5 tables
 *
 * Creates vector search tables (vec0) and full-text search tables (FTS5)
 * for BIMCO charter party clauses (GENCON 2022, HEAVYCON, PROJECTCON).
 *
 * Vec0 table: used for semantic similarity search (cosine k-NN)
 * FTS5 table: used for BM25 keyword search (charter party clause terms)
 *
 * Spec: gamma-09
 */

import type { Migration } from './types';

const migration029: Migration = {
  version: 29,
  name: 'bimco-rag',
  up(db) {
    // Vec0 virtual table for semantic search (sqlite-vec)
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bimco_vec USING vec0(
        embedding FLOAT[768],
        content TEXT,
        metadata TEXT
      );
    `);

    // FTS5 virtual table for keyword search (BM25 ranking)
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bimco_fts USING fts5(
        content,
        metadata,
        tokenize='unicode61 remove_diacritics 1'
      );
    `);
  },
  down(db) {
    // Drop FTS5 table
    db.exec(`
      DROP TABLE IF EXISTS bimco_fts;
    `);

    // Drop vec0 table
    db.exec(`
      DROP TABLE IF EXISTS bimco_vec;
    `);
  },
};

export default migration029;
