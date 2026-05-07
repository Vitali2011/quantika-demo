/**
 * JWC RAG adapter — orchestrates scraper + chunker + embeddings pipeline
 * Phase 2: RAG expansion — Block D (JWC RAG), item D1
 *
 * Syncs JWC bulletins into vector (jwc_vec) and FTS (jwc_fts) tables.
 * Separate from existing lib/knowledge/jwc/adapter.ts (structured war_risk_zones).
 */

import type { Database } from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { scrapeJwc } from './scraper';
import { chunkJwc } from './chunker';
import { embedAndStore } from '@/lib/knowledge/embeddings/pipeline';
import {
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
} from '@/lib/knowledge/governance';

export interface SyncJwcRagOptions {
  dryRun?: boolean;
  db?: Database.Database;
}

/**
 * Sync JWC bulletins into RAG knowledge graph
 *
 * Input Contract:
 * - JWC_SOURCE_URL undefined/empty → throw Error
 * - dryRun=true → skip embedAndStore, return chunksStored=0
 * - scraper failure → reportSyncFailure, re-throw
 * - embedAndStore failure → reportSyncFailure, re-throw
 * - zero bulletins → reportSyncSuccess with rowsChanged=0
 *
 * @param opts - Sync options (dryRun, db)
 * @returns { chunksStored, bulletinsScraped } — counts for sync result
 * @throws Error when JWC_SOURCE_URL not set or sync fails
 */
export async function syncJwcRag(
  opts?: SyncJwcRagOptions
): Promise<{ chunksStored: number; bulletinsScraped: number }> {
  const { dryRun = false, db = getDb() } = opts || {};

  const sourceUrl = process.env.JWC_SOURCE_URL;
  if (!sourceUrl || sourceUrl.trim() === '') {
    throw new Error('JWC_SOURCE_URL env var is required');
  }

  const syncLogId = reportSyncStarted(db, 'jwc');

  try {
    const bulletins = await scrapeJwc(sourceUrl);
    const chunks = chunkJwc(bulletins);

    if (dryRun) {
      console.log(
        `[dryRun] JWC sync: ${bulletins.length} bulletins → ${chunks.length} chunks (not stored)`
      );

      const latestDate =
        bulletins.length > 0
          ? bulletins.sort((a, b) => b.publishDate.localeCompare(a.publishDate))[0]
              .publishDate
          : null;

      await reportSyncSuccess(db, syncLogId, {
        rowsChanged: 0,
        upstreamVersion: latestDate || undefined,
      });

      return { chunksStored: 0, bulletinsScraped: bulletins.length };
    }

    await embedAndStore(chunks, {
      tableName: 'jwc_vec',
      ftsTable: 'jwc_fts',
      truncate: true,
      db,
    });

    const latestDate =
      bulletins.length > 0
        ? bulletins.sort((a, b) => b.publishDate.localeCompare(a.publishDate))[0]
            .publishDate
        : null;

    await reportSyncSuccess(db, syncLogId, {
      rowsChanged: chunks.length,
      upstreamVersion: latestDate || undefined,
    });

    return { chunksStored: chunks.length, bulletinsScraped: bulletins.length };
  } catch (error) {
    await reportSyncFailure(db, syncLogId, error as Error);
    throw error;
  }
}
