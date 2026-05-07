/**
 * TEMP-STAB-spec-20: JWC RAG adapter stub for CLI tests
 *
 * This is a temporary stub to allow spec-20 tests to run.
 * Will be replaced by spec-19 implementation.
 */

export interface SyncJwcRagOptions {
  dryRun?: boolean;
}

export interface SyncJwcRagResult {
  bulletinsScraped: number;
  chunksStored: number;
}

export async function syncJwcRag(opts?: SyncJwcRagOptions): Promise<SyncJwcRagResult> {
  // TEMP-STAB-spec-20: stub implementation, spec-19 will provide real adapter
  throw new Error('syncJwcRag not implemented - spec-19 pending');
}
