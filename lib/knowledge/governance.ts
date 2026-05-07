import type Database from 'better-sqlite3';
import type { RegisterSourceInput, SourceRow } from './types';
import { fireAlert } from './alerts';

export function registerSource(db: Database.Database, input: RegisterSourceInput): void {
  db.prepare(`
    INSERT INTO knowledge_sources (
      slug, name, kind, category, source_url, license, refresh_command,
      refresh_mode, stale_threshold_days, primary_table, vector_table,
      freshness_check_sql, tenant_scope, metadata
    ) VALUES (
      @slug, @name, @kind, @category, @source_url, @license, @refresh_command,
      @refresh_mode, @stale_threshold_days, @primary_table, @vector_table,
      @freshness_check_sql, @tenant_scope, @metadata
    )
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      kind = excluded.kind,
      category = excluded.category,
      source_url = excluded.source_url,
      license = excluded.license,
      refresh_command = excluded.refresh_command,
      refresh_mode = excluded.refresh_mode,
      stale_threshold_days = excluded.stale_threshold_days,
      primary_table = excluded.primary_table,
      vector_table = excluded.vector_table,
      freshness_check_sql = excluded.freshness_check_sql,
      tenant_scope = excluded.tenant_scope,
      metadata = excluded.metadata,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    slug: input.slug,
    name: input.name,
    kind: input.kind,
    category: input.category,
    source_url: input.source_url ?? null,
    license: input.license ?? null,
    refresh_command: input.refresh_command ?? null,
    refresh_mode: input.refresh_mode,
    stale_threshold_days: input.stale_threshold_days,
    primary_table: input.primary_table ?? null,
    vector_table: input.vector_table ?? null,
    freshness_check_sql: input.freshness_check_sql ?? null,
    tenant_scope: input.tenant_scope ?? 'global',
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export function reportSyncStarted(db: Database.Database, slug: string): number {
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE knowledge_sync_log
      SET status = 'aborted',
          finished_at = CURRENT_TIMESTAMP,
          error_message = COALESCE(error_message, 'superseded by new sync')
      WHERE source_slug = ? AND status = 'running'
    `).run(slug);

    const r = db.prepare(`
      INSERT INTO knowledge_sync_log (source_slug, started_at, status)
      VALUES (?, CURRENT_TIMESTAMP, 'running')
    `).run(slug);
    return Number(r.lastInsertRowid);
  });
  return tx();
}

export interface SyncSuccessOpts {
  rowsChanged?: number;
  upstreamVersion?: string;
  metadata?: Record<string, unknown>;
}

export function reportSyncSuccess(
  db: Database.Database,
  syncLogId: number,
  opts: SyncSuccessOpts = {},
): void {
  // Input validation: syncLogId must be a positive finite integer
  if (!Number.isFinite(syncLogId) || syncLogId <= 0 || !Number.isInteger(syncLogId)) {
    throw new Error('syncLogId must be a positive integer');
  }

  // Input validation: metadata size limit (64KB)
  if (opts.metadata !== undefined) {
    const metadataJson = JSON.stringify(opts.metadata);
    if (metadataJson.length > 65536) {
      throw new Error('metadata exceeds 64KB limit');
    }
  }

  // Input validation: rowsChanged must be non-negative finite integer
  if (opts.rowsChanged !== undefined) {
    if (!Number.isFinite(opts.rowsChanged) || opts.rowsChanged < 0 || !Number.isInteger(opts.rowsChanged)) {
      throw new Error('rowsChanged must be a non-negative integer');
    }
  }

  const log = db.prepare('SELECT source_slug, started_at, status FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
  if (!log) throw new Error(`sync_log id=${syncLogId} not found`);

  // Idempotency guard: prevent double-close
  if (log.status !== 'running') {
    throw new Error(`Cannot close sync_log id=${syncLogId}: already closed with status '${log.status}'`);
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE knowledge_sync_log
      SET status = 'success',
          finished_at = CURRENT_TIMESTAMP,
          rows_changed = ?,
          duration_ms = CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400000 AS INTEGER),
          metadata = ?
      WHERE id = ?
    `).run(
      opts.rowsChanged ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
      syncLogId,
    );
    db.prepare(`
      UPDATE knowledge_sources
      SET status = 'fresh',
          last_synced_at = CURRENT_TIMESTAMP,
          fetched_at = CURRENT_TIMESTAMP,
          parsed_at = CURRENT_TIMESTAMP,
          row_count = COALESCE(?, row_count),
          upstream_version = COALESCE(?, upstream_version),
          consecutive_failures = 0,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE slug = ?
    `).run(opts.rowsChanged ?? null, opts.upstreamVersion ?? null, log.source_slug);
  });
  tx();
}

/**
 * Categorize error based on error type and message.
 */
function categorizeError(error: unknown): string {
  if (!error) return 'unknown';

  const errorName = (error as Error).name ?? '';
  const errorMessage = String((error as Error).message ?? error).toLowerCase();
  const errorStack = String((error as Error).stack ?? '').toLowerCase();
  const combined = `${errorName} ${errorMessage} ${errorStack}`;

  // Network errors
  if (
    combined.includes('etimedout') ||
    combined.includes('econnreset') ||
    combined.includes('econnrefused') ||
    combined.includes('enotfound') ||
    combined.includes('fetch failed')
  ) {
    return 'network';
  }

  // Parse errors
  if (
    errorName === 'SyntaxError' ||
    combined.includes('syntaxerror') ||
    combined.includes('parse') ||
    combined.includes('malformed')
  ) {
    return 'parse';
  }

  // Timeout errors
  if (
    errorName === 'AbortError' ||
    combined.includes('aborterror') ||
    combined.includes('timeout')
  ) {
    return 'timeout';
  }

  // Database errors
  if (
    combined.includes('sqlite') ||
    combined.includes('constraint') ||
    combined.includes('unique')
  ) {
    return 'db';
  }

  return 'unknown';
}

export function reportSyncFailure(
  db: Database.Database,
  syncLogId: number,
  error: Error,
): void {
  // Input validation: syncLogId must be a positive finite integer
  if (!Number.isFinite(syncLogId) || syncLogId <= 0 || !Number.isInteger(syncLogId)) {
    throw new Error('syncLogId must be a positive integer');
  }

  const log = db.prepare('SELECT source_slug, status FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
  if (!log) throw new Error(`sync_log id=${syncLogId} not found`);

  // Idempotency guard: prevent double-close
  if (log.status !== 'running') {
    throw new Error(`Cannot close sync_log id=${syncLogId}: already closed with status '${log.status}'`);
  }

  // Coerce non-Error values to Error
  let normalizedError: Error;
  if (error instanceof Error) {
    normalizedError = error;
  } else if (error === null || error === undefined) {
    normalizedError = new Error('Unknown error');
  } else {
    normalizedError = new Error(String(error));
  }

  // Categorize error
  const errorCategory = categorizeError(normalizedError);

  // Build metadata with error_category
  const metadata = { error_category: errorCategory };

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE knowledge_sync_log
      SET status = 'failure',
          finished_at = CURRENT_TIMESTAMP,
          error_message = ?,
          metadata = ?
      WHERE id = ?
    `).run(
      String(normalizedError?.stack ?? normalizedError?.message ?? normalizedError),
      JSON.stringify(metadata),
      syncLogId
    );
    db.prepare(`
      UPDATE knowledge_sources
      SET status = 'failed',
          last_error = ?,
          consecutive_failures = consecutive_failures + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE slug = ?
    `).run(String(normalizedError?.message ?? normalizedError), log.source_slug);
  });
  tx();

  // Fire alert if consecutive_failures >= 2 (threshold per design doc)
  const source = db.prepare('SELECT consecutive_failures, last_error FROM knowledge_sources WHERE slug = ?').get(log.source_slug) as any;
  if (source && source.consecutive_failures >= 2) {
    // Best-effort: don't propagate fireAlert errors
    fireAlert({
      slug: log.source_slug,
      consecutiveFailures: source.consecutive_failures,
      lastError: source.last_error,
    }).catch((err) => {
      console.error(`fireAlert failed for ${log.source_slug}:`, err);
    });
  }
}

export function getSourceStatus(db: Database.Database, slug: string): SourceRow | null {
  const rows = listSources(db, { slug });
  return rows[0] ?? null;
}

export function listSources(db: Database.Database, opts: { slug?: string } = {}): SourceRow[] {
  const where = opts.slug ? 'WHERE slug = ?' : '';
  const params = opts.slug ? [opts.slug] : [];
  return db.prepare(`
    SELECT
      slug, name, kind, category, status, refresh_mode,
      last_synced_at, stale_threshold_days, consecutive_failures,
      row_count, refresh_command, last_error, upstream_version,
      CASE
        WHEN consecutive_failures >= 1 THEN 'failing'
        WHEN last_synced_at IS NULL THEN 'never_synced'
        WHEN julianday('now') - julianday(last_synced_at) > stale_threshold_days THEN 'overdue'
        ELSE 'ok'
      END AS health_signal,
      CASE
        WHEN last_synced_at IS NULL THEN NULL
        ELSE CAST(julianday('now') - julianday(last_synced_at) AS INTEGER)
      END AS days_since_sync
    FROM knowledge_sources
    ${where}
    ORDER BY
      CASE
        WHEN consecutive_failures >= 1 THEN 0
        WHEN last_synced_at IS NULL THEN 1
        WHEN julianday('now') - julianday(last_synced_at) > stale_threshold_days THEN 2
        ELSE 3
      END,
      category, slug
  `).all(...params) as SourceRow[];
}
