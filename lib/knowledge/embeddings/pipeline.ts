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
 */

import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { embedDocuments } from './client';
import type { Chunk } from './chunks';

const MAX_BATCH_SIZE = 250;
const MAX_CHUNK_LENGTH = 2048;

export interface EmbedAndStoreOptions {
  tableName: string;
  truncate?: boolean; // Default false (strict mode)
  db?: Database.Database; // Optional db instance (for testing)
}

/**
 * Embeds chunks and stores them in the specified vec0 virtual table.
 *
 * @param chunks - Array of chunks to embed and store
 * @param opts - Configuration options (tableName, truncate)
 * @throws RangeError if truncate=false and any chunk exceeds 2048 chars
 * @throws Error if tableName doesn't exist (bubbled from SQLite)
 */
export async function embedAndStore(
  chunks: Chunk[],
  opts: EmbedAndStoreOptions
): Promise<void> {
  const { tableName, truncate = false, db: providedDb } = opts;

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

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = embeddings[j];

      // Convert Float32Array to JSON array string for vec0
      const embeddingJson = JSON.stringify(Array.from(embedding));

      stmt.run({
        content: chunk.content,
        metadata: JSON.stringify(chunk.metadata),
        embedding: embeddingJson,
      });
    }
  }
}
