/**
 * Generic embedding pipeline for Knowledge Layer
 *
 * Input contract:
 * - Empty chunks array → no-op (no API call, no INSERT)
 * - chunks with empty content → still embedded (Vertex returns valid vector)
 * - tableName for nonexistent table → SQLite throws clearly (bubbles to caller)
 * - truncate=false on >2048 char chunk → RangeError before API call (cost guard)
 * - truncate=true on >2048 char chunk → Vertex auto-truncates
 * - Large batches (>250) → auto-batched into multiple API calls
 * - ftsTable=undefined → No FTS5 insert (backward compat)
 * - ftsTable="" → SQLite throws (invalid table name)
 * - ftsTable="nonexistent" → SQLite throws clearly (bubbles to caller)
 * - dryRun=true → logs chunk count and skips API + DB writes (cost protection)
 * - dryRun=undefined → defaults to false (full pipeline)
 */

import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { embedDocuments } from './client';
import type { Chunk } from './chunks';
import { logDryRun } from './dry-run';

const MAX_BATCH_SIZE = 250;
const MAX_CHUNK_LENGTH = 2048;

export interface EmbedAndStoreOptions {
  tableName: string;
  truncate?: boolean; // Default false (strict mode)
  db?: Database.Database; // Optional db instance (for testing)
  ftsTable?: string; // Optional FTS5 table for dual-insert (hybrid retrieval)
  dryRun?: boolean; // Default false — if true, log count and skip API/DB writes
}

/**
 * Embeds chunks and stores them in the specified vec0 virtual table.
 *
 * @param chunks - Array of chunks to embed and store
 * @param opts - Configuration options (tableName, truncate, dryRun)
 * @throws RangeError if truncate=false and any chunk exceeds 2048 chars
 * @throws Error if tableName doesn't exist (bubbled from SQLite)
 */
export async function embedAndStore(
  chunks: Chunk[],
  opts: EmbedAndStoreOptions
): Promise<void> {
  const { tableName, truncate = false, db: providedDb, ftsTable, dryRun = false } = opts;

  // Empty array guard — no-op
  if (chunks.length === 0) {
    return;
  }

  // Truncate guard (cost protection)
  if (!truncate) {
    for (const chunk of chunks) {
      if (chunk.content.length > MAX_CHUNK_LENGTH) {
        throw new RangeError(
          `Chunk content exceeds ${MAX_CHUNK_LENGTH} character limit. ` +
            `Set truncate=true to allow Vertex AI auto-truncation.`
        );
      }
    }
  }

  // DryRun guard — log count and skip API + DB writes
  if (dryRun) {
    const totalChars = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    logDryRun({
      event: 'embedAndStore:dryRun',
      tableName,
      chunkCount: chunks.length,
      totalChars,
      skipped: true,
    });
    return;
  }

  // Guard: allowlist tableName and ftsTable to prevent SQL injection
  const ALLOWED_VEC_TABLES = ['imsbc_vec', 'igc_vec', 'jwc_vec', 'bimco_vec'];
  const ALLOWED_FTS_TABLES = ['imsbc_fts', 'igc_fts', 'jwc_fts', 'bimco_fts'];

  if (!tableName || !tableName.trim()) {
    throw new Error('tableName is required');
  }
  if (!ALLOWED_VEC_TABLES.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}. Must be one of: ${ALLOWED_VEC_TABLES.join(', ')}`);
  }
  if (ftsTable !== undefined) {
    if (!ftsTable || !ftsTable.trim()) {
      throw new Error('ftsTable must be a non-empty string when provided');
    }
    if (!ALLOWED_FTS_TABLES.includes(ftsTable)) {
      throw new Error(`Invalid ftsTable name: ${ftsTable}. Must be one of: ${ALLOWED_FTS_TABLES.join(', ')}`);
    }
  }

  if (providedDb === null) {
    throw new Error('Database instance required');
  }
  const db = providedDb ?? getDb();

  // Process in batches of MAX_BATCH_SIZE
  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    // Call embedding API (batched)
    const embeddings = await embedDocuments(texts);

    // Insert each chunk + embedding into vec table
    const stmt = db.prepare(
      `INSERT INTO ${tableName} (content, metadata, embedding) VALUES (@content, @metadata, @embedding)`
    );

    // Optional FTS5 dual-insert statement
    const ftsStmt = ftsTable
      ? db.prepare(`INSERT INTO ${ftsTable} (content, metadata) VALUES (@content, @metadata)`)
      : null;

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = embeddings[j];

      // Convert Float32Array to JSON array string for vec0
      const embeddingJson = JSON.stringify(Array.from(embedding));

      // Normalize NaN/Infinity to 0 to prevent silent JSON corruption (NaN → null)
      const metadataJson = JSON.stringify(chunk.metadata, (_key, value) =>
        typeof value === 'number' && !Number.isFinite(value) ? 0 : value
      );

      // Insert into vec0 table
      stmt.run({
        content: chunk.content,
        metadata: metadataJson,
        embedding: embeddingJson,
      });

      // Dual-insert into FTS5 table if ftsTable is provided
      if (ftsStmt) {
        ftsStmt.run({
          content: chunk.content,
          metadata: metadataJson,
        });
      }
    }
  }
}
