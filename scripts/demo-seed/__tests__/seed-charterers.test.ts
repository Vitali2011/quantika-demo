/**
 * Tests for seed-charterers.ts — demo charterer ratings fixture + idempotent seeding.
 * Uses an in-memory sqlite db mirroring the demo-seed.db charterers DDL.
 */
import Database from 'better-sqlite3';

import { CHARTERER_FIXTURE, DEMO_NOTES, seedCharterersWithDb } from '../seed-charterers';
import { resolveChartererTier } from '@/lib/matching/charterer-tier';
import type { ParsedCargo } from '@/lib/types';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE charterers (
      id           TEXT PRIMARY KEY NOT NULL,
      name         TEXT NOT NULL UNIQUE,
      tier         TEXT NOT NULL CHECK(tier IN ('blue-chip','second','weak')),
      payment_history TEXT NOT NULL DEFAULT '[]',
      require_lc   INTEGER NOT NULL DEFAULT 0,
      notes        TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe('CHARTERER_FIXTURE', () => {
  it('has unique ids and unique names', () => {
    const ids = CHARTERER_FIXTURE.map((r) => r.id);
    const names = CHARTERER_FIXTURE.map((r) => r.name.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('ids are hyphen-normalized (lowercase alphanumerics and hyphens only)', () => {
    for (const r of CHARTERER_FIXTURE) {
      expect(r.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('contains at least one weak-tier charterer (CHARTERER_TIER_PENALTY visibility)', () => {
    expect(CHARTERER_FIXTURE.filter((r) => r.tier === 'weak').length).toBeGreaterThanOrEqual(1);
  });

  it('weak charterers require LC', () => {
    for (const r of CHARTERER_FIXTURE.filter((x) => x.tier === 'weak')) {
      expect(r.require_lc).toBe(1);
    }
  });

  it('every row carries the demo notes marker and valid JSON payment_history', () => {
    for (const r of CHARTERER_FIXTURE) {
      expect(r.notes).toBe(DEMO_NOTES);
      expect(() => JSON.parse(r.payment_history)).not.toThrow();
    }
  });
});

describe('seedCharterersWithDb', () => {
  it('seeds all fixture rows into an empty table', () => {
    const db = makeDb();
    seedCharterersWithDb(db);
    const count = (db.prepare('SELECT COUNT(*) c FROM charterers').get() as { c: number }).c;
    expect(count).toBe(CHARTERER_FIXTURE.length);
    db.close();
  });

  it('is idempotent: re-running converges to the same row set', () => {
    const db = makeDb();
    seedCharterersWithDb(db);
    seedCharterersWithDb(db);
    const rows = db.prepare('SELECT id, name, tier FROM charterers ORDER BY id').all();
    expect(rows).toHaveLength(CHARTERER_FIXTURE.length);
    db.close();
  });

  it('removes stale demo-marked rows that left the fixture', () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO charterers (id, name, tier, payment_history, require_lc, notes)
       VALUES ('stale-demo', 'STALE DEMO', 'second', '[]', 0, ?)`,
    ).run(DEMO_NOTES);
    seedCharterersWithDb(db);
    const stale = db.prepare(`SELECT 1 FROM charterers WHERE id = 'stale-demo'`).get();
    expect(stale).toBeUndefined();
    db.close();
  });

  // qa-smoke F4: marker renamed (internal jargon leaked to UI) — old-marker rows must still be cleaned
  it('removes rows seeded under the LEGACY demo marker (pre-rename migration)', () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO charterers (id, name, tier, payment_history, require_lc, notes)
       VALUES ('legacy-demo', 'LEGACY DEMO', 'second', '[]', 0, 'demo-universe rating (audit A.1)')`,
    ).run();
    seedCharterersWithDb(db);
    const legacy = db.prepare(`SELECT 1 FROM charterers WHERE id = 'legacy-demo'`).get();
    expect(legacy).toBeUndefined();
    db.close();
  });

  // qa-smoke F4: notes surface in the demo UI — must be broker-friendly, no internal audit jargon
  it('demo notes marker contains no internal jargon (audit refs)', () => {
    expect(DEMO_NOTES).not.toMatch(/audit|demo-universe/i);
  });

  it('does not touch rows without the demo notes marker', () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO charterers (id, name, tier, payment_history, require_lc, notes)
       VALUES ('manual-row', 'MANUAL CHARTERER', 'blue-chip', '[]', 0, 'added by admin')`,
    ).run();
    seedCharterersWithDb(db);
    const manual = db.prepare(`SELECT 1 FROM charterers WHERE id = 'manual-row'`).get();
    expect(manual).toBeDefined();
    db.close();
  });

  it('seeded names resolve through resolveChartererTier normalized-name lookup', () => {
    const db = makeDb();
    seedCharterersWithDb(db);
    // Corpus spellings differ in case from fixture display names — must still resolve.
    expect(resolveChartererTier(db, { chartererName: 'huaya' } as ParsedCargo)).toBe('weak');
    expect(resolveChartererTier(db, { chartererName: 'GRAIN TRADER A' } as ParsedCargo)).toBe('blue-chip');
    expect(resolveChartererTier(db, { chartererName: 'grain trader b' } as ParsedCargo)).toBe('second');
    expect(resolveChartererTier(db, { chartererName: 'UNKNOWN CO' } as ParsedCargo)).toBeNull();
    db.close();
  });
});
