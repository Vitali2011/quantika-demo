/**
 * IGC (International Grain Code) adapter — governance lifecycle integration
 * Orchestrates: reportSyncStarted → scrape → chunk → embed → reportSyncSuccess/Failure
 *
 * Source: imorules.com/INTGRAIN.html (HTML, ~20 sections Part A + Part B + Appendix)
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
import { scrapeIgc } from './scraper';
import { chunkIgc } from './chunker';

export interface SyncIgcOptions {
  dryRun?: boolean;
  db?: Database.Database;
  sourceUrl?: string;
}

export interface SyncIgcResult {
  syncLogId: number;
  chunksProcessed: number;
  sectionsScraped: number;
  dryRun: boolean;
}

export async function syncIgc(opts?: SyncIgcOptions): Promise<SyncIgcResult> {
  const { dryRun = false, db: providedDb, sourceUrl: providedUrl } = opts ?? {};

  const db = providedDb ?? getDb();

  const sourceUrl = providedUrl ?? process.env.IGC_SOURCE_URL;
  if (!sourceUrl || sourceUrl.trim() === '') {
    throw new Error('IGC_SOURCE_URL is required');
  }

  const syncLogId = reportSyncStarted(db, 'igc');

  try {
    const sections = await scrapeIgc(sourceUrl);
    const chunks = chunkIgc(sections);

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

    await embedAndStore(chunks, {
      tableName: 'igc_vec',
      ftsTable: 'igc_fts',
      truncate: true,
      db,
    });

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
    reportSyncFailure(db, syncLogId, error as Error);
    throw error;
  }
}
