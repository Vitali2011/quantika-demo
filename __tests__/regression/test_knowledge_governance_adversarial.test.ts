/**
 * Adversarial QA — governance.ts + bootstrap.ts
 * Target: design/knowledge-layer-2026-05-05 (Block A)
 * Date: 2026-05-06
 * Reviewer: test-skill cold-start
 *
 * Originally these tests documented 4 confirmed bugs (KG-1, KG-2 ×2, KG-3).
 * After fixes (commits c12fca9 et seq.) the assertions were inverted to lock
 * the correct post-fix behavior. They now serve as a permanent regression
 * guard — any reintroduction of the original bugs will turn them red.
 */

import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import {
  registerSource,
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
  getSourceStatus,
  listSources,
} from '@/lib/knowledge/governance';
import {
  bootstrapKnowledgeSources,
  KNOWLEDGE_REGISTRY,
} from '@/lib/knowledge/bootstrap';

jest.mock('@/lib/knowledge/alerts', () => ({
  fireAlert: jest.fn().mockResolvedValue(undefined),
}));

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  return db;
}

function seedSource(db: Database.Database, slug = 'test-src', thresholdDays = 7) {
  registerSource(db, {
    slug,
    name: `Source ${slug}`,
    kind: 'structured_rows',
    category: 'reference',
    stale_threshold_days: thresholdDays,
    refresh_mode: 'manual',
  });
}

// ─── BUG-KG-1: health_signal misleads when source failed 1-2 times but never synced ─────

describe('BUG-KG-1: health_signal with consecutive_failures 1-2 and NULL last_synced_at', () => {
  /**
   * CONFIRMED BUG: A source that has failed 1 or 2 times but has never successfully
   * synced (last_synced_at IS NULL) shows health_signal = 'never_synced'.
   *
   * This misleads operators — 'never_synced' implies "not configured yet" but
   * the source HAS been attempted and failed. The CASE statement checks
   * consecutive_failures >= 3 first, then last_synced_at IS NULL, so values
   * 1..2 get swallowed by the IS NULL branch.
   *
   * Expected behavior: a source that has ever failed should show 'failing' or
   * at least NOT 'never_synced' until it accumulates 3+ failures.
   *
   * Root cause: lib/knowledge/governance.ts listSources() SQL CASE expression:
   *   WHEN consecutive_failures >= 3 THEN 'failing'    ← threshold too high
   *   WHEN last_synced_at IS NULL THEN 'never_synced'  ← catches 1-2 failures
   */

  it('1 consecutive failure + NULL last_synced_at → shows failing (not never_synced)', () => {
    const db = freshDb();
    seedSource(db);

    const id = reportSyncStarted(db, 'test-src');
    reportSyncFailure(db, id, new Error('first failure'));

    const src = getSourceStatus(db, 'test-src');
    expect(src).not.toBeNull();

    // BUG: actual is 'never_synced' — source has failed once but looks unconfigured
    // Expected: health_signal should NOT be 'never_synced' when consecutive_failures > 0
    expect(src!.health_signal).not.toBe('never_synced');
    // It should indicate some failure state
    expect(['failing', 'overdue'].includes(src!.health_signal as string)).toBe(true);
  });

  it('2 consecutive failures + NULL last_synced_at → shows failing', () => {
    const db = freshDb();
    seedSource(db);

    const id1 = reportSyncStarted(db, 'test-src');
    reportSyncFailure(db, id1, new Error('first'));
    const id2 = reportSyncStarted(db, 'test-src');
    reportSyncFailure(db, id2, new Error('second'));

    const src = getSourceStatus(db, 'test-src');
    expect(src!.consecutive_failures).toBe(2);

    // BUG: 2 consecutive failures shows as 'never_synced' — operators won't investigate
    expect(src!.health_signal).not.toBe('never_synced');
  });

  it('3 consecutive failures + NULL last_synced_at → correctly shows failing', () => {
    const db = freshDb();
    seedSource(db);

    for (let i = 0; i < 3; i++) {
      const id = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id, new Error(`failure ${i + 1}`));
    }

    const src = getSourceStatus(db, 'test-src');
    // This one correctly shows 'failing' because consecutive_failures >= 3
    expect(src!.health_signal).toBe('failing');
  });
});

// ─── BUG-KG-2: orphaned 'running' rows in knowledge_sync_log ─────────────────

describe('BUG-KG-2: orphaned running sync_log rows (concurrency / cron race)', () => {
  /**
   * CONFIRMED ISSUE: If reportSyncStarted is called twice for the same source
   * without a corresponding Success/Failure close, the older row stays in
   * knowledge_sync_log with status='running' permanently.
   *
   * Real scenario: cron job + manual refresh triggered simultaneously.
   * Both create 'running' rows. Only one gets closed. The other leaks.
   *
   * Impact: Monitoring dashboards/queries that count active syncs will show
   * ghost 'running' rows. If any future "is_syncing" check queries for
   * status='running' rows, it would incorrectly think a sync is in progress.
   *
   * Root cause: governance.ts has no deduplication or cleanup mechanism.
   * reportSyncStarted always inserts a new row without checking existing ones.
   */

  it('two reportSyncStarted calls leave only one running row (prior is aborted)', () => {
    const db = freshDb();
    seedSource(db);

    const id1 = reportSyncStarted(db, 'test-src');
    const id2 = reportSyncStarted(db, 'test-src');

    expect(id1).not.toBe(id2);

    // After fix: only id2 stays 'running'; id1 is auto-aborted
    const runningRows = db.prepare(
      "SELECT id FROM knowledge_sync_log WHERE source_slug = 'test-src' AND status = 'running'"
    ).all();
    expect(runningRows).toHaveLength(1);

    // id1 was demoted to 'aborted' with explanatory error_message
    const id1Row = db.prepare(
      "SELECT status, error_message, finished_at FROM knowledge_sync_log WHERE id = ?"
    ).get(id1) as any;
    expect(id1Row.status).toBe('aborted');
    expect(id1Row.error_message).toBe('superseded by new sync');
    expect(id1Row.finished_at).not.toBeNull();

    // Close id2 normally — orphan count must remain 0
    reportSyncSuccess(db, id2, { rowsChanged: 10 });
    const orphans = db.prepare(
      "SELECT id FROM knowledge_sync_log WHERE source_slug = 'test-src' AND status = 'running'"
    ).all();
    expect(orphans).toHaveLength(0);
  });

  it('source status is fresh after race + successful close; prior row aborted', () => {
    const db = freshDb();
    seedSource(db);

    // Simulate race: two starts, only second completes
    const id1 = reportSyncStarted(db, 'test-src');
    const id2 = reportSyncStarted(db, 'test-src');
    reportSyncSuccess(db, id2, { rowsChanged: 5 });

    const src = getSourceStatus(db, 'test-src');
    // Source itself is correctly marked fresh
    expect(src!.status).toBe('fresh');
    // id1 was aborted by the second reportSyncStarted — no orphan
    const id1Row = db.prepare('SELECT status FROM knowledge_sync_log WHERE id = ?').get(id1) as any;
    expect(id1Row.status).toBe('aborted');
  });
});

// ─── BUG-KG-3 (LOW): bootstrapKnowledgeSources skips metadata updates for existing sources ──

describe('BUG-KG-3 (LOW): bootstrap skips registry updates for existing sources', () => {
  /**
   * Low-severity design issue: bootstrapKnowledgeSources checks if slug exists
   * and SKIPS if it does. This means updates to KNOWLEDGE_REGISTRY (e.g.,
   * stale_threshold_days changed from 2 to 1) are silently ignored for
   * already-bootstrapped DBs.
   *
   * This is documented as intentional (preserve runtime state), but it also
   * prevents legitimate metadata updates from propagating.
   *
   * Note: registerSource() uses ON CONFLICT DO UPDATE which would update metadata
   * WITHOUT touching status/last_synced_at/consecutive_failures. The bootstrap's
   * existence check is therefore overly conservative.
   */

  it('bootstrapKnowledgeSources propagates stale_threshold_days changes on re-run', () => {
    const db = freshDb();

    // First bootstrap
    bootstrapKnowledgeSources(db);

    // Simulate an old value left over from a previous registry version
    db.prepare("UPDATE knowledge_sources SET stale_threshold_days = 99 WHERE slug = 'ofac'").run();

    // Re-bootstrap (simulating server restart after KNOWLEDGE_REGISTRY update)
    bootstrapKnowledgeSources(db);

    const src = db.prepare("SELECT stale_threshold_days FROM knowledge_sources WHERE slug = 'ofac'").get() as any;

    // After fix: registry value (2) is restored; the old stale value (99) is overwritten.
    expect(src.stale_threshold_days).toBe(2);
  });

  it('bootstrap re-run does not reset runtime state (status / last_synced_at / consecutive_failures)', () => {
    const db = freshDb();
    bootstrapKnowledgeSources(db);

    // Simulate runtime state accumulated since first bootstrap
    db.prepare(`
      UPDATE knowledge_sources
      SET status = 'fresh',
          last_synced_at = '2026-01-01 10:00:00',
          consecutive_failures = 7,
          last_error = 'simulated',
          row_count = 4242
      WHERE slug = 'ofac'
    `).run();

    bootstrapKnowledgeSources(db);

    const src = db.prepare(`
      SELECT status, last_synced_at, consecutive_failures, last_error, row_count
      FROM knowledge_sources WHERE slug = 'ofac'
    `).get() as any;
    expect(src.status).toBe('fresh');
    expect(src.last_synced_at).toBe('2026-01-01 10:00:00');
    expect(src.consecutive_failures).toBe(7);
    expect(src.last_error).toBe('simulated');
    expect(src.row_count).toBe(4242);
  });
});

// ─── CLEAN: FK enforcement (not a bug, documents expected behavior) ───────────

describe('CLEAN: FK enforcement blocks orphaned sync_log inserts', () => {
  it('reportSyncStarted on unknown slug throws FK constraint', () => {
    const db = freshDb();
    // No source registered with slug 'ghost'
    expect(() => reportSyncStarted(db, 'ghost')).toThrow();
  });

  it('reportSyncSuccess on invalid syncLogId throws clearly', () => {
    const db = freshDb();
    seedSource(db);
    expect(() => reportSyncSuccess(db, 99999, {})).toThrow(/sync_log id=99999 not found/);
  });

  it('reportSyncFailure on invalid syncLogId throws clearly', () => {
    const db = freshDb();
    seedSource(db);
    expect(() => reportSyncFailure(db, 99999, new Error('x'))).toThrow(/sync_log id=99999 not found/);
  });
});

// ─── CLEAN: getSourceStatus and listSources edge cases ───────────────────────

describe('CLEAN: getSourceStatus and listSources edge cases', () => {
  it('getSourceStatus returns null for unknown slug (no throw)', () => {
    const db = freshDb();
    expect(getSourceStatus(db, 'nonexistent')).toBeNull();
  });

  it('listSources on empty DB returns empty array (no throw)', () => {
    const db = freshDb();
    expect(listSources(db)).toEqual([]);
  });

  it('listSources with slug filter on unknown slug returns empty array', () => {
    const db = freshDb();
    seedSource(db);
    expect(listSources(db, { slug: 'nonexistent' })).toEqual([]);
  });

  it('health_signal is ok for a freshly synced source', () => {
    const db = freshDb();
    seedSource(db, 'fresh-src', 365);

    const id = reportSyncStarted(db, 'fresh-src');
    reportSyncSuccess(db, id, { rowsChanged: 100 });

    const src = getSourceStatus(db, 'fresh-src');
    expect(src!.health_signal).toBe('ok');
  });
});

// ─── CLEAN: ai-provider computeCostUsd edge cases (pure function, no DB needed) ──

describe('CLEAN: computeCostUsd edge cases', () => {
  // Dynamic import since it's a TS module; we test the guards
  let computeCostUsd: (
    provider: 'openai' | 'gemini' | 'bedrock',
    model: string,
    promptTokens: number | null | undefined,
    completionTokens: number | null | undefined,
  ) => number | null;

  beforeAll(async () => {
    const mod = await import('@/lib/ai-provider');
    computeCostUsd = mod.computeCostUsd;
  });

  it('NaN promptTokens → returns null (no negative cost)', () => {
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', NaN, 100)).toBeNull();
  });

  it('Infinity promptTokens → returns null', () => {
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', Infinity, 100)).toBeNull();
  });

  it('negative promptTokens → returns null', () => {
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', -1, 100)).toBeNull();
  });

  it('negative completionTokens → returns null', () => {
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', 1000, -50)).toBeNull();
  });

  it('null promptTokens → returns null', () => {
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', null, 100)).toBeNull();
  });

  it('unknown model → returns null (not a guess)', () => {
    expect(computeCostUsd('gemini', 'gemini-3.0-ultra-unknown', 1000, 500)).toBeNull();
  });

  it('openai provider → returns null (openai does not surface usage tokens)', () => {
    expect(computeCostUsd('openai', 'gpt-5.5', 1000, 500)).toBeNull();
  });

  it('valid gemini-2.5-flash call → returns correct cost', () => {
    // 1000 prompt @ $0.075/M + 500 completion @ $0.30/M = $0.000075 + $0.00015 = $0.000225
    const cost = computeCostUsd('gemini', 'gemini-2.5-flash', 1000, 500);
    expect(cost).not.toBeNull();
    expect(cost!).toBeCloseTo(0.000225, 6);
  });
});

// ─── CLEAN: KNOWLEDGE_REGISTRY slug uniqueness ───────────────────────────────

describe('CLEAN: KNOWLEDGE_REGISTRY slug uniqueness', () => {
  it('all 10 registry slugs are unique (no duplicates)', () => {
    const slugs = KNOWLEDGE_REGISTRY.map((r) => r.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('all registry entries have required fields', () => {
    for (const src of KNOWLEDGE_REGISTRY) {
      expect(src.slug).toBeTruthy();
      expect(src.name).toBeTruthy();
      expect(src.kind).toBeTruthy();
      expect(src.category).toBeTruthy();
      expect(src.stale_threshold_days).toBeGreaterThan(0);
      expect(src.refresh_mode).toBeTruthy();
    }
  });
});
