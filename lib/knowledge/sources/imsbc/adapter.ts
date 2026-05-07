/**
 * IMSBC adapter — governance lifecycle integration
 * Orchestrates: reportSyncStarted → scrape → chunk → embed → reportSyncSuccess/Failure
 *
 * Input contract:
 * - sourceUrl empty/undefined → throw Error before reportSyncStarted
 * - dryRun=true → skip embedAndStore, reportSyncSuccess with dryRun metadata
 * - sections=[] → embedAndStore with 0 chunks, reportSyncSuccess rowsChanged: 0
 * - scraper/embed throws → reportSyncFailure + re-throw
 */

import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { reportSyncStarted, reportSyncSuccess, reportSyncFailure } from '@/lib/knowledge/governance';
import { embedAndStore } from '@/lib/knowledge/embeddings/pipeline';
import { scrapeImsbc } from './scraper';
import { chunkImsbc } from './chunker';

export interface SyncImsbcOptions {
  dryRun?: boolean;
  db?: Database.Database;
  sourceUrl?: string;
}

export interface SyncImsbcResult {
  syncLogId: number;
  chunksProcessed: number;
  sectionsScraped: number;
  dryRun: boolean;
}

export async function syncImsbc(opts?: SyncImsbcOptions): Promise<SyncImsbcResult> {
  const { dryRun = false, db: providedDb, sourceUrl: providedUrl } = opts ?? {};

  // Resolve db
  const db = providedDb ?? getDb();

  // Resolve sourceUrl — validate non-empty
  const sourceUrl = providedUrl ?? process.env.IMSBC_SOURCE_URL;
  if (!sourceUrl || sourceUrl.trim() === '') {
    throw new Error('IMSBC_SOURCE_URL is required');
  }

  // Report sync started
  const syncLogId = reportSyncStarted(db, 'imsbc');

  try {
    // Scrape sections
    const sections = await scrapeImsbc(sourceUrl);

    // Chunk sections
    const chunks = chunkImsbc(sections);

    // Dry run mode
    if (dryRun) {
      reportSyncSuccess(db, syncLogId, {
        rowsChanged: 0,
        metadata: { dryRun: true, chunkCount: chunks.length },
      });

      return {
        syncLogId,
        chunksProcessed: chunks.length,
        sectionsScraped: sections.length,
        dryRun: true,
      };
    }

    // Embed and store
    await embedAndStore(chunks, {
      tableName: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      truncate: true,
      db,
    });

    // Report success
    reportSyncSuccess(db, syncLogId, {
      rowsChanged: chunks.length,
      upstreamVersion: sourceUrl,
      metadata: { sectionsScraped: sections.length },
    });

    return {
      syncLogId,
      chunksProcessed: chunks.length,
      sectionsScraped: sections.length,
      dryRun: false,
    };
  } catch (error) {
    // Report failure and re-throw
    reportSyncFailure(db, syncLogId, error as Error);
    throw error;
  }
}
