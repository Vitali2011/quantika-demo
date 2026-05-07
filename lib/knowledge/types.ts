export type SourceKind = 'structured_rows' | 'vector_chunks' | 'mixed';
export type SourceCategory = 'regulatory' | 'market' | 'reference' | 'sanctions' | 'geo';
export type RefreshMode = 'auto-daily' | 'auto-weekly' | 'manual' | 'one-shot';
export type SourceStatus = 'unknown' | 'fresh' | 'stale' | 'failed';
export type HealthSignal = 'ok' | 'overdue' | 'failing' | 'never_synced';

export interface RegisterSourceInput {
  slug: string;
  name: string;
  kind: SourceKind;
  category: SourceCategory;
  stale_threshold_days: number;
  refresh_mode: RefreshMode;
  source_url?: string;
  license?: string;
  refresh_command?: string;
  primary_table?: string;
  vector_table?: string;
  freshness_check_sql?: string;
  tenant_scope?: string;
  metadata?: Record<string, unknown>;
}

export interface SourceRow {
  slug: string;
  name: string;
  kind: SourceKind;
  category: SourceCategory;
  status: SourceStatus;
  refresh_mode: RefreshMode;
  last_synced_at: string | null;
  stale_threshold_days: number;
  consecutive_failures: number;
  row_count: number | null;
  refresh_command: string | null;
  last_error: string | null;
  upstream_version: string | null;
  health_signal: HealthSignal;
  days_since_sync: number | null;
}
