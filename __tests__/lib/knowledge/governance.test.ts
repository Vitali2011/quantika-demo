import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import {
  registerSource, reportSyncStarted, reportSyncSuccess, reportSyncFailure,
  getSourceStatus, listSources,
} from '@/lib/knowledge/governance';
import * as alerts from '@/lib/knowledge/alerts';

// Mock fireAlert
jest.mock('@/lib/knowledge/alerts', () => ({
  fireAlert: jest.fn().mockResolvedValue(undefined),
}));

describe('governance', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration013.up(db);
    registerSource(db, {
      slug: 'test-src',
      name: 'Test Source',
      kind: 'structured_rows',
      category: 'reference',
      stale_threshold_days: 7,
      refresh_mode: 'manual',
    });
    jest.clearAllMocks();
  });

  it('registerSource is idempotent (upsert)', () => {
    registerSource(db, {
      slug: 'test-src', name: 'Renamed', kind: 'structured_rows',
      category: 'reference', stale_threshold_days: 14, refresh_mode: 'manual',
    });
    const row = db.prepare("SELECT name, stale_threshold_days FROM knowledge_sources WHERE slug = 'test-src'").get() as any;
    expect(row.name).toBe('Renamed');
    expect(row.stale_threshold_days).toBe(14);
  });

  it('reportSyncStarted creates sync_log row, returns id', () => {
    const id = reportSyncStarted(db, 'test-src');
    expect(typeof id).toBe('number');
    const row = db.prepare('SELECT * FROM knowledge_sync_log WHERE id = ?').get(id) as any;
    expect(row.source_slug).toBe('test-src');
    expect(row.status).toBe('running');
    expect(row.started_at).toBeTruthy();
  });

  it('reportSyncSuccess updates source + sync_log, resets failures', () => {
    const id = reportSyncStarted(db, 'test-src');
    reportSyncSuccess(db, id, { rowsChanged: 42, upstreamVersion: 'v2025-Q1' });
    const src = db.prepare("SELECT * FROM knowledge_sources WHERE slug = 'test-src'").get() as any;
    expect(src.status).toBe('fresh');
    expect(src.last_synced_at).toBeTruthy();
    expect(src.row_count).toBe(42);
    expect(src.upstream_version).toBe('v2025-Q1');
    expect(src.consecutive_failures).toBe(0);
    const log = db.prepare('SELECT * FROM knowledge_sync_log WHERE id = ?').get(id) as any;
    expect(log.status).toBe('success');
    expect(log.rows_changed).toBe(42);
    expect(log.finished_at).toBeTruthy();
    expect(log.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('reportSyncFailure increments consecutive_failures, sets status=failed', () => {
    const id1 = reportSyncStarted(db, 'test-src');
    reportSyncFailure(db, id1, new Error('boom'));
    let src = db.prepare("SELECT * FROM knowledge_sources WHERE slug = 'test-src'").get() as any;
    expect(src.status).toBe('failed');
    expect(src.consecutive_failures).toBe(1);
    expect(src.last_error).toMatch(/boom/);

    const id2 = reportSyncStarted(db, 'test-src');
    reportSyncFailure(db, id2, new Error('again'));
    src = db.prepare("SELECT * FROM knowledge_sources WHERE slug = 'test-src'").get() as any;
    expect(src.consecutive_failures).toBe(2);
  });

  it('listSources returns rows with health_signal computed', () => {
    const id = reportSyncStarted(db, 'test-src');
    reportSyncSuccess(db, id, { rowsChanged: 1 });
    const sources = listSources(db);
    expect(sources).toHaveLength(1);
    expect(sources[0].health_signal).toBe('ok');
  });

  it('getSourceStatus returns null for unknown slug', () => {
    expect(getSourceStatus(db, 'nope')).toBeNull();
  });

  describe('alerting on consecutive failures', () => {
    it('1 failure → no alert', () => {
      const id = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id, new Error('first failure'));
      expect(alerts.fireAlert).not.toHaveBeenCalled();
    });

    it('2 consecutive failures → 1 alert', () => {
      const id1 = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id1, new Error('first failure'));
      const id2 = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id2, new Error('second failure'));

      expect(alerts.fireAlert).toHaveBeenCalledTimes(1);
      expect(alerts.fireAlert).toHaveBeenCalledWith({
        slug: 'test-src',
        consecutiveFailures: 2,
        lastError: 'second failure',
      });
    });

    it('3 consecutive failures → 2 alerts total (each call alerts)', () => {
      const id1 = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id1, new Error('first'));
      const id2 = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id2, new Error('second'));
      const id3 = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id3, new Error('third'));

      expect(alerts.fireAlert).toHaveBeenCalledTimes(2);
      expect(alerts.fireAlert).toHaveBeenNthCalledWith(1, {
        slug: 'test-src',
        consecutiveFailures: 2,
        lastError: 'second',
      });
      expect(alerts.fireAlert).toHaveBeenNthCalledWith(2, {
        slug: 'test-src',
        consecutiveFailures: 3,
        lastError: 'third',
      });
    });

    it('failure → success → failure resets counter, no alert on single failure', () => {
      const id1 = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id1, new Error('first'));
      const id2 = reportSyncStarted(db, 'test-src');
      reportSyncSuccess(db, id2, { rowsChanged: 10 });
      const id3 = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id3, new Error('after success'));

      expect(alerts.fireAlert).not.toHaveBeenCalled();
      const src = db.prepare("SELECT consecutive_failures FROM knowledge_sources WHERE slug = 'test-src'").get() as any;
      expect(src.consecutive_failures).toBe(1);
    });

    it('fireAlert is best-effort: if it throws, sync still completes', () => {
      (alerts.fireAlert as jest.Mock).mockRejectedValueOnce(new Error('Sentry down'));

      const id1 = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id1, new Error('first'));
      const id2 = reportSyncStarted(db, 'test-src');

      expect(() => reportSyncFailure(db, id2, new Error('second'))).not.toThrow();

      const src = db.prepare("SELECT consecutive_failures FROM knowledge_sources WHERE slug = 'test-src'").get() as any;
      expect(src.consecutive_failures).toBe(2);
    });
  });
});
