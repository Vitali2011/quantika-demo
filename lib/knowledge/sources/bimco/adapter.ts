/**
 * BIMCO adapter — governance lifecycle integration
 * Orchestrates: reportSyncStarted → fixture load → embed → store → reportSyncSuccess/Failure
 *
 * Input contract (.specs/gamma-09-input-contracts.md):
 * - db null/undefined → throw Error("db is required")
 * - dryRun=true → skip storage, return count
 * - dryRun=false/undefined → store normally
 * - Empty fixture → store 0 rows, return {stored: 0}
 *
 * Spec: gamma-09
 */

import type Database from 'better-sqlite3';
import { reportSyncStarted, reportSyncSuccess, reportSyncFailure } from '@/lib/knowledge/governance';
import { embedAndStore } from '@/lib/knowledge/embeddings/pipeline';
import type { Chunk } from '@/lib/knowledge/embeddings/chunks';
import { BIMCO_FIXTURE_CLAUSES } from './fixture';
import type { BimcoClause } from './types';

export interface SyncBimcoRagResult {
  stored: number;
}

/**
 * Syncs BIMCO charter party clauses to RAG tables.
 * Uses BIMCO_FIXTURE_CLAUSES (no real scraping in this version).
 *
 * @param db - SQLite database instance
 * @param dryRun - If true, skip storage and return count only
 * @returns Result with count of stored clauses
 * @throws Error if db is missing or sync fails
 */
export async function syncBimcoRag(db: Database.Database, dryRun = false): Promise<SyncBimcoRagResult> {
  // Input validation: db required
  if (!db) {
    throw new Error('db is required');
  }

  // Report sync started
  const syncLogId = reportSyncStarted(db, 'bimco');

  try {
    // Load fixture clauses (in production, this would scrape bimco.org)
    const clauses = BIMCO_FIXTURE_CLAUSES;

    // Convert BimcoClause to Chunk format
    const chunks: Chunk[] = clauses.map((clause: BimcoClause) => ({
      content: clause.text,
      metadata: {
        source: 'bimco',
        sourceUrl: clause.sourceUrl,
        charterParty: clause.charterParty,
        clauseNumber: clause.clauseNumber,
        title: clause.title,
        id: clause.id,
      },
    }));

    // Dry run mode
    if (dryRun) {
      reportSyncSuccess(db, syncLogId, {
        rowsChanged: 0,
        metadata: { dryRun: true, chunkCount: chunks.length },
      });

      return {
        stored: chunks.length,
      };
    }

    // Embed and store chunks
    if (chunks.length > 0) {
      await embedAndStore(chunks, {
        tableName: 'bimco_vec',
        ftsTable: 'bimco_fts',
        truncate: true,
        db,
      });
    }

    // Report success
    reportSyncSuccess(db, syncLogId, {
      rowsChanged: chunks.length,
      upstreamVersion: 'fixture-v1',
      metadata: { clausesProcessed: clauses.length },
    });

    return {
      stored: chunks.length,
    };
  } catch (error) {
    // Report failure and re-throw
    reportSyncFailure(db, syncLogId, error as Error);
    throw error;
  }
}
