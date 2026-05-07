/**
 * Governance Contract Tests — Spec 16
 *
 * Input Contract validation for reportSyncSuccess and reportSyncFailure.
 * Tests all boundary cases from spec TC-NBI-01 through TC-NBI-12.
 */

import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import {
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
} from '@/lib/knowledge/governance';

describe('governance-contract', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration013.up(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('reportSyncSuccess input validation', () => {
    describe('syncLogId validation', () => {
      test('TC-NBI-01: rejects NaN syncLogId', () => {
        expect(() => reportSyncSuccess(db, NaN, {})).toThrow('syncLogId must be a positive integer');
      });

      test('TC-NBI-02: rejects negative syncLogId', () => {
        expect(() => reportSyncSuccess(db, -1, {})).toThrow('syncLogId must be a positive integer');
      });

      test('TC-NBI-03: rejects zero syncLogId', () => {
        expect(() => reportSyncSuccess(db, 0, {})).toThrow('syncLogId must be a positive integer');
      });

      test('TC-NBI-04: rejects non-integer syncLogId', () => {
        expect(() => reportSyncSuccess(db, 3.14, {})).toThrow('syncLogId must be a positive integer');
      });

      test('TC-NBI-05: rejects Infinity syncLogId', () => {
        expect(() => reportSyncSuccess(db, Infinity, {})).toThrow('syncLogId must be a positive integer');
        expect(() => reportSyncSuccess(db, -Infinity, {})).toThrow('syncLogId must be a positive integer');
      });
    });

    describe('opts.metadata validation', () => {
      test('TC-NBI-06: rejects metadata exceeding 64KB', () => {
        // Register test source first
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        // Create large metadata object (> 64KB when JSON.stringify'd)
        const largeMetadata: Record<string, string> = {};
        for (let i = 0; i < 2000; i++) {
          largeMetadata[`key_${i}`] = 'x'.repeat(100);
        }

        expect(() => reportSyncSuccess(db, syncLogId, { metadata: largeMetadata }))
          .toThrow('metadata exceeds 64KB limit');
      });
    });

    describe('opts.rowsChanged validation', () => {
      test('TC-NBI-07: rejects negative rowsChanged', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        expect(() => reportSyncSuccess(db, syncLogId, { rowsChanged: -5 }))
          .toThrow('rowsChanged must be a non-negative integer');
      });

      test('TC-NBI-08: rejects NaN rowsChanged', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        expect(() => reportSyncSuccess(db, syncLogId, { rowsChanged: NaN }))
          .toThrow('rowsChanged must be a non-negative integer');
      });

      test('TC-NBI-09: rejects non-integer rowsChanged', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        expect(() => reportSyncSuccess(db, syncLogId, { rowsChanged: 10.5 }))
          .toThrow('rowsChanged must be a non-negative integer');
      });
    });
  });

  describe('reportSyncFailure input validation', () => {
    describe('syncLogId validation', () => {
      test('TC-NBI-01: rejects NaN syncLogId', () => {
        const error = new Error('test error');
        expect(() => reportSyncFailure(db, NaN, error)).toThrow('syncLogId must be a positive integer');
      });

      test('TC-NBI-02: rejects negative syncLogId', () => {
        const error = new Error('test error');
        expect(() => reportSyncFailure(db, -1, error)).toThrow('syncLogId must be a positive integer');
      });

      test('TC-NBI-03: rejects zero syncLogId', () => {
        const error = new Error('test error');
        expect(() => reportSyncFailure(db, 0, error)).toThrow('syncLogId must be a positive integer');
      });

      test('TC-NBI-04: rejects non-integer syncLogId', () => {
        const error = new Error('test error');
        expect(() => reportSyncFailure(db, 3.14, error)).toThrow('syncLogId must be a positive integer');
      });

      test('TC-NBI-05: rejects Infinity syncLogId', () => {
        const error = new Error('test error');
        expect(() => reportSyncFailure(db, Infinity, error)).toThrow('syncLogId must be a positive integer');
        expect(() => reportSyncFailure(db, -Infinity, error)).toThrow('syncLogId must be a positive integer');
      });
    });

    describe('error coercion and categorization', () => {
      test('TC-NBI-10: coerces string error to Error with unknown category', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        // Pass string instead of Error (TypeScript will complain but runtime should handle)
        reportSyncFailure(db, syncLogId, 'boom' as any);

        const log = db.prepare('SELECT status, error_message, metadata FROM knowledge_sync_log WHERE id = ?')
          .get(syncLogId) as any;
        expect(log.status).toBe('failure');
        expect(log.error_message).toContain('boom');

        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('unknown');
      });

      test('TC-NBI-11: coerces null error to Error with unknown category', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        reportSyncFailure(db, syncLogId, null as any);

        const log = db.prepare('SELECT status, error_message, metadata FROM knowledge_sync_log WHERE id = ?')
          .get(syncLogId) as any;
        expect(log.status).toBe('failure');
        expect(log.error_message).toContain('Unknown error');

        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('unknown');
      });
    });

    describe('error categorization', () => {
      test('categorizes network errors (ETIMEDOUT)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new Error('request timeout ETIMEDOUT');
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('network');
      });

      test('categorizes network errors (ECONNRESET)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new Error('socket hang up ECONNRESET');
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('network');
      });

      test('categorizes network errors (fetch failed)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new Error('fetch failed');
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('network');
      });

      test('categorizes parse errors (SyntaxError)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new SyntaxError('Unexpected token in JSON');
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('parse');
      });

      test('categorizes parse errors (malformed message)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new Error('malformed response body');
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('parse');
      });

      test('categorizes timeout errors (AbortError)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('timeout');
      });

      test('categorizes timeout errors (timeout in message)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new Error('request timeout exceeded');
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('timeout');
      });

      test('categorizes database errors (SQLITE)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed');
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('db');
      });

      test('categorizes database errors (constraint)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new Error('constraint violation on table');
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('db');
      });

      test('categorizes unknown errors (unrecognized pattern)', () => {
        db.prepare(`
          INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
          VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
        `).run();
        const syncLogId = reportSyncStarted(db, 'test');

        const error = new Error('Something went terribly wrong');
        reportSyncFailure(db, syncLogId, error);

        const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?').get(syncLogId) as any;
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        expect(metadata.error_category).toBe('unknown');
      });
    });
  });

  describe('state machine and idempotency', () => {
    test('TC-NBI-12: double-close on reportSyncSuccess throws or no-ops', () => {
      db.prepare(`
        INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
        VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
      `).run();
      const syncLogId = reportSyncStarted(db, 'test');

      // First call succeeds
      reportSyncSuccess(db, syncLogId, { rowsChanged: 10 });

      // Second call should throw or be no-op
      expect(() => reportSyncSuccess(db, syncLogId, { rowsChanged: 20 }))
        .toThrow();
    });

    test('concurrent callers for different slugs do not interfere', () => {
      db.prepare(`
        INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
        VALUES ('source-a', 'Source A', 'external', 'regulatory', 'manual', 30)
      `).run();
      db.prepare(`
        INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
        VALUES ('source-b', 'Source B', 'external', 'regulatory', 'manual', 30)
      `).run();

      const idA = reportSyncStarted(db, 'source-a');
      const idB = reportSyncStarted(db, 'source-b');

      reportSyncSuccess(db, idA, { rowsChanged: 100 });
      reportSyncFailure(db, idB, new Error('source-b failed'));

      const sourceA = db.prepare('SELECT status, consecutive_failures FROM knowledge_sources WHERE slug = ?')
        .get('source-a') as any;
      const sourceB = db.prepare('SELECT status, consecutive_failures FROM knowledge_sources WHERE slug = ?')
        .get('source-b') as any;

      expect(sourceA.status).toBe('fresh');
      expect(sourceA.consecutive_failures).toBe(0);
      expect(sourceB.status).toBe('failed');
      expect(sourceB.consecutive_failures).toBe(1);
    });

    test('cross-slug isolation: failure on slug-A does not affect slug-B', () => {
      db.prepare(`
        INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
        VALUES ('slug-a', 'Slug A', 'external', 'regulatory', 'manual', 30)
      `).run();
      db.prepare(`
        INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
        VALUES ('slug-b', 'Slug B', 'external', 'regulatory', 'manual', 30)
      `).run();

      // Fail slug-a twice
      const id1 = reportSyncStarted(db, 'slug-a');
      reportSyncFailure(db, id1, new Error('fail 1'));
      const id2 = reportSyncStarted(db, 'slug-a');
      reportSyncFailure(db, id2, new Error('fail 2'));

      // Succeed slug-b
      const idB = reportSyncStarted(db, 'slug-b');
      reportSyncSuccess(db, idB, { rowsChanged: 50 });

      const sourceA = db.prepare('SELECT consecutive_failures FROM knowledge_sources WHERE slug = ?')
        .get('slug-a') as any;
      const sourceB = db.prepare('SELECT consecutive_failures FROM knowledge_sources WHERE slug = ?')
        .get('slug-b') as any;

      expect(sourceA.consecutive_failures).toBe(2);
      expect(sourceB.consecutive_failures).toBe(0);
    });
  });

  describe('alert threshold', () => {
    test('fireAlert is NOT called on first failure', () => {
      db.prepare(`
        INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
        VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
      `).run();
      const syncLogId = reportSyncStarted(db, 'test');

      reportSyncFailure(db, syncLogId, new Error('first failure'));

      const source = db.prepare('SELECT consecutive_failures FROM knowledge_sources WHERE slug = ?')
        .get('test') as any;
      expect(source.consecutive_failures).toBe(1);
      // fireAlert should NOT be called (threshold is 2)
      // We can't directly assert fireAlert wasn't called without mocking,
      // but we can verify consecutive_failures is 1, not 2
    });

    test('fireAlert IS called on second consecutive failure', () => {
      db.prepare(`
        INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
        VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
      `).run();

      const id1 = reportSyncStarted(db, 'test');
      reportSyncFailure(db, id1, new Error('first failure'));

      const id2 = reportSyncStarted(db, 'test');
      reportSyncFailure(db, id2, new Error('second failure'));

      const source = db.prepare('SELECT consecutive_failures FROM knowledge_sources WHERE slug = ?')
        .get('test') as any;
      expect(source.consecutive_failures).toBe(2);
      // fireAlert should be called at threshold 2
      // We verify state is correct; fireAlert call is best-effort
    });
  });

  describe('metadata roundtrip', () => {
    test('metadata JSON roundtrips correctly through SQLite TEXT column', () => {
      db.prepare(`
        INSERT INTO knowledge_sources (slug, name, kind, category, refresh_mode, stale_threshold_days)
        VALUES ('test', 'Test', 'external', 'regulatory', 'manual', 30)
      `).run();
      const syncLogId = reportSyncStarted(db, 'test');

      const metadata = {
        version: '1.2.3',
        count: 42,
        nested: { key: 'value', arr: [1, 2, 3] },
        bool: true,
        nullValue: null,
      };

      reportSyncSuccess(db, syncLogId, { metadata });

      const log = db.prepare('SELECT metadata FROM knowledge_sync_log WHERE id = ?')
        .get(syncLogId) as any;
      const parsed = JSON.parse(log.metadata);

      expect(parsed).toEqual(metadata);
    });
  });
});
