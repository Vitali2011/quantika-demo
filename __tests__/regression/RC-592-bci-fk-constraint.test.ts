/**
 * Regression: RC-592-bci-fk-constraint
 *
 * Verifies that market-bci is registered in KNOWLEDGE_REGISTRY so that
 * reportSyncStarted(db, 'market-bci') does not throw SQLITE_CONSTRAINT_FOREIGNKEY.
 *
 * Root cause: PR #585 added the BCI adapter and wired refresh-market-indices.ts
 * to call reportSyncStarted(db, 'market-bci'), but omitted the corresponding
 * entry in KNOWLEDGE_REGISTRY (bootstrap.ts). knowledge_sync_log.source_slug
 * has a FK reference to knowledge_sources.slug, so the missing row caused
 * SQLITE_CONSTRAINT_FOREIGNKEY on every BCI refresh attempt.
 */

import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import { bootstrapKnowledgeSources, KNOWLEDGE_REGISTRY } from '@/lib/knowledge/bootstrap';
import { reportSyncStarted, reportSyncSuccess } from '@/lib/knowledge/governance';

describe('RC-592 market-bci FK constraint regression', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration013.up(db);
    bootstrapKnowledgeSources(db);
  });

  afterEach(() => {
    db.close();
  });

  it('KNOWLEDGE_REGISTRY contains market-bci slug', () => {
    const slugs = KNOWLEDGE_REGISTRY.map((r) => r.slug);
    expect(slugs).toContain('market-bci');
  });

  it('reportSyncStarted does not throw FK constraint for market-bci', () => {
    expect(() => reportSyncStarted(db, 'market-bci')).not.toThrow();
  });

  it('full sync cycle for market-bci completes without FK error', () => {
    const id = reportSyncStarted(db, 'market-bci');
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    expect(() => reportSyncSuccess(db, id, { rowsChanged: 1 })).not.toThrow();
  });

  it('market-bci and market-bdi both registered — all market indices have FK-safe slugs', () => {
    const marketSlugs = ['market-bdi', 'market-bci', 'market-bhsi', 'market-drewry-wci'];
    for (const slug of marketSlugs) {
      expect(() => reportSyncStarted(db, slug)).not.toThrow();
    }
  });
});
