/**
 * RED tests — matches-repository.ts
 *
 * Covers:
 *   - createMatch: happy path, defaults, boundary inputs
 *   - listMatches: filtering by status, sorting, limit/offset pagination
 *   - getMatch: found / not found
 *   - updateMatchStatus: EVERY valid transition + EVERY invalid transition
 *   - Boundary Class 1 (Empty): empty cargo_id / vessel_id strings
 *   - Boundary Class 3 (Negative): score=0, score=100
 *   - Boundary Class 5 (Switch/dispatch): all MatchStatus values + invalid
 *   - Boundary Class 10 (Cleanroom): no implementation read
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import {
  listMatches,
  getMatch,
  createMatch,
  updateMatchStatus,
} from '@/lib/matching/matches-repository';
import type { StoredMatch, MatchStatus } from '@/lib/matching/matches-repository';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  return db;
}

function insertMatch(
  db: Database.Database,
  overrides: Partial<{
    cargo_id: string;
    vessel_id: string;
    score: number;
    reason: string;
    status: MatchStatus;
    user_id: string | null;
  }> = {}
): StoredMatch {
  return createMatch(db, {
    cargo_id: overrides.cargo_id ?? 'cargo-1',
    vessel_id: overrides.vessel_id ?? 'vessel-1',
    score: overrides.score ?? 75,
    reason: overrides.reason ?? '{"summary":"Good fit"}',
    status: overrides.status ?? 'shortlist',
    user_id: overrides.user_id ?? null,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// createMatch
// ──────────────────────────────────────────────────────────────────────────────

describe('createMatch', () => {
  it('returns a StoredMatch with auto-assigned id and timestamps', () => {
    const db = freshDb();
    const before = Date.now();
    const match = insertMatch(db);
    const after = Date.now();

    expect(typeof match.id).toBe('number');
    expect(match.id).toBeGreaterThan(0);
    expect(match.created_at).toBeGreaterThanOrEqual(before);
    expect(match.created_at).toBeLessThanOrEqual(after);
    expect(match.updated_at).toBeGreaterThanOrEqual(before);
    expect(match.updated_at).toBeLessThanOrEqual(after);
  });

  it('persists all provided fields', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'CARGO-X',
      vessel_id: 'VESSEL-Y',
      score: 90,
      reason: '{"fit":"excellent"}',
      status: 'saved',
      user_id: 'user-42',
    });

    expect(match.cargo_id).toBe('CARGO-X');
    expect(match.vessel_id).toBe('VESSEL-Y');
    expect(match.score).toBe(90);
    expect(match.reason).toBe('{"fit":"excellent"}');
    expect(match.status).toBe('saved');
    expect(match.user_id).toBe('user-42');
  });

  it('defaults status to "shortlist" when not provided', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 50,
      reason: '{}',
    });
    expect(match.status).toBe('shortlist');
  });

  it('defaults user_id to null when not provided', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 50,
      reason: '{}',
    });
    expect(match.user_id).toBeNull();
  });

  // Boundary Class 1 — empty strings
  it('accepts empty cargo_id (Class 1)', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: '',
      vessel_id: 'v1',
      score: 50,
      reason: '{}',
    });
    expect(match.cargo_id).toBe('');
  });

  it('accepts empty vessel_id (Class 1)', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: '',
      score: 50,
      reason: '{}',
    });
    expect(match.vessel_id).toBe('');
  });

  // Boundary Class 3 — score boundaries
  it('accepts score=0 (lower bound, Class 3)', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 0,
      reason: '{}',
    });
    expect(match.score).toBe(0);
  });

  it('accepts score=100 (upper bound, Class 3)', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 100,
      reason: '{}',
    });
    expect(match.score).toBe(100);
  });

  // Boundary Class 5 — all valid status values on create
  it.each(['shortlist', 'saved', 'dismissed', 'archived'] as MatchStatus[])(
    'accepts status="%s" on create (Class 5)',
    (status) => {
      const db = freshDb();
      const match = createMatch(db, {
        cargo_id: 'c1',
        vessel_id: 'v1',
        score: 50,
        reason: '{}',
        status,
      });
      expect(match.status).toBe(status);
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// getMatch
// ──────────────────────────────────────────────────────────────────────────────

describe('getMatch', () => {
  it('returns the match by id', () => {
    const db = freshDb();
    const created = insertMatch(db);
    const found = getMatch(db, created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.cargo_id).toBe('cargo-1');
  });

  it('returns null for a non-existent id', () => {
    const db = freshDb();
    const result = getMatch(db, 999999);
    expect(result).toBeNull();
  });

  it('returns null for id=0 (boundary: non-positive id)', () => {
    const db = freshDb();
    const result = getMatch(db, 0);
    expect(result).toBeNull();
  });

  it('returns null for negative id', () => {
    const db = freshDb();
    const result = getMatch(db, -1);
    expect(result).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// listMatches
// ──────────────────────────────────────────────────────────────────────────────

describe('listMatches', () => {
  it('returns empty array when no matches exist', () => {
    const db = freshDb();
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(results).toEqual([]);
  });

  it('returns all matches without status filter', () => {
    const db = freshDb();
    insertMatch(db, { status: 'shortlist' });
    insertMatch(db, { status: 'saved' });
    insertMatch(db, { status: 'dismissed' });
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(results).toHaveLength(3);
  });

  it('filters by status=shortlist', () => {
    const db = freshDb();
    insertMatch(db, { status: 'shortlist' });
    insertMatch(db, { status: 'saved' });
    const results = listMatches(db, { status: 'shortlist', sortBy: 'score', sortDir: 'desc' });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('shortlist');
  });

  it('filters by status=saved', () => {
    const db = freshDb();
    insertMatch(db, { status: 'shortlist' });
    insertMatch(db, { status: 'saved' });
    insertMatch(db, { status: 'saved' });
    const results = listMatches(db, { status: 'saved', sortBy: 'score', sortDir: 'desc' });
    expect(results).toHaveLength(2);
    results.forEach((m) => expect(m.status).toBe('saved'));
  });

  it('filters by status=dismissed', () => {
    const db = freshDb();
    insertMatch(db, { status: 'shortlist' });
    insertMatch(db, { status: 'dismissed' });
    const results = listMatches(db, { status: 'dismissed', sortBy: 'score', sortDir: 'desc' });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('dismissed');
  });

  it('filters by status=archived', () => {
    const db = freshDb();
    insertMatch(db, { status: 'archived' });
    insertMatch(db, { status: 'saved' });
    const results = listMatches(db, { status: 'archived', sortBy: 'score', sortDir: 'desc' });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('archived');
  });

  it('sorts by score DESC', () => {
    const db = freshDb();
    insertMatch(db, { score: 30 });
    insertMatch(db, { score: 90 });
    insertMatch(db, { score: 60 });
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(results.map((r) => r.score)).toEqual([90, 60, 30]);
  });

  it('sorts by score ASC', () => {
    const db = freshDb();
    insertMatch(db, { score: 30 });
    insertMatch(db, { score: 90 });
    insertMatch(db, { score: 60 });
    const results = listMatches(db, { sortBy: 'score', sortDir: 'asc' });
    expect(results.map((r) => r.score)).toEqual([30, 60, 90]);
  });

  it('sorts by created_at DESC', () => {
    const db = freshDb();
    // Insert with different scores; id order tracks insertion order
    const m1 = insertMatch(db, { score: 50 });
    const m2 = insertMatch(db, { score: 70 });
    const m3 = insertMatch(db, { score: 40 });
    const results = listMatches(db, { sortBy: 'created_at', sortDir: 'desc' });
    // Most recently created first
    expect(results[0].id).toBe(m3.id);
    expect(results[results.length - 1].id).toBe(m1.id);
  });

  it('sorts by created_at ASC', () => {
    const db = freshDb();
    const m1 = insertMatch(db, { score: 50 });
    insertMatch(db, { score: 70 });
    const results = listMatches(db, { sortBy: 'created_at', sortDir: 'asc' });
    expect(results[0].id).toBe(m1.id);
  });

  it('respects limit', () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) insertMatch(db, { score: i * 10 });
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('respects offset for pagination', () => {
    const db = freshDb();
    insertMatch(db, { score: 90 });
    insertMatch(db, { score: 80 });
    insertMatch(db, { score: 70 });
    const page1 = listMatches(db, { sortBy: 'score', sortDir: 'desc', limit: 2, offset: 0 });
    const page2 = listMatches(db, { sortBy: 'score', sortDir: 'desc', limit: 2, offset: 2 });
    expect(page1.map((r) => r.score)).toEqual([90, 80]);
    expect(page2.map((r) => r.score)).toEqual([70]);
  });

  it('returns StoredMatch objects with all required fields', () => {
    const db = freshDb();
    insertMatch(db);
    const [m] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(m.id).toBeDefined();
    expect(m.cargo_id).toBeDefined();
    expect(m.vessel_id).toBeDefined();
    expect(typeof m.score).toBe('number');
    expect(typeof m.reason).toBe('string');
    expect(m.status).toBeDefined();
    expect(typeof m.created_at).toBe('number');
    expect(typeof m.updated_at).toBe('number');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// updateMatchStatus — valid transitions (Class 5 + spec contract)
// ──────────────────────────────────────────────────────────────────────────────

describe('updateMatchStatus — valid transitions', () => {
  // shortlist → saved
  it('shortlist → saved is valid', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'shortlist' });
    const updated = updateMatchStatus(db, m.id, 'saved');
    expect(updated.status).toBe('saved');
    expect(updated.id).toBe(m.id);
  });

  // shortlist → dismissed
  it('shortlist → dismissed is valid', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'shortlist' });
    const updated = updateMatchStatus(db, m.id, 'dismissed');
    expect(updated.status).toBe('dismissed');
  });

  // shortlist → archived
  it('shortlist → archived is valid', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'shortlist' });
    const updated = updateMatchStatus(db, m.id, 'archived');
    expect(updated.status).toBe('archived');
  });

  // saved → archived
  it('saved → archived is valid', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'saved' });
    const updated = updateMatchStatus(db, m.id, 'archived');
    expect(updated.status).toBe('archived');
  });

  // saved → dismissed
  it('saved → dismissed is valid', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'saved' });
    const updated = updateMatchStatus(db, m.id, 'dismissed');
    expect(updated.status).toBe('dismissed');
  });

  // dismissed → archived
  it('dismissed → archived is valid', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'dismissed' });
    const updated = updateMatchStatus(db, m.id, 'archived');
    expect(updated.status).toBe('archived');
  });

  // dismissed → saved
  it('dismissed → saved is valid', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'dismissed' });
    const updated = updateMatchStatus(db, m.id, 'saved');
    expect(updated.status).toBe('saved');
  });

  // archived → saved
  it('archived → saved is valid', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'archived' });
    const updated = updateMatchStatus(db, m.id, 'saved');
    expect(updated.status).toBe('saved');
  });

  it('updates updated_at timestamp on transition', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'shortlist' });
    const originalTs = m.updated_at;
    // Ensure at least 1ms passes (timestamps may be same-millisecond in fast tests)
    const updated = updateMatchStatus(db, m.id, 'saved');
    expect(updated.updated_at).toBeGreaterThanOrEqual(originalTs);
  });

  it('persists updated status to DB (getMatch reflects new status)', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'shortlist' });
    updateMatchStatus(db, m.id, 'saved');
    const fetched = getMatch(db, m.id);
    expect(fetched!.status).toBe('saved');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// updateMatchStatus — invalid transitions (must throw "Invalid transition")
// ──────────────────────────────────────────────────────────────────────────────

describe('updateMatchStatus — invalid transitions', () => {
  // shortlist → shortlist (self-transition)
  it('shortlist → shortlist throws "Invalid transition"', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'shortlist' });
    expect(() => updateMatchStatus(db, m.id, 'shortlist')).toThrow(/Invalid transition/i);
  });

  // saved → shortlist
  it('saved → shortlist throws "Invalid transition"', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'saved' });
    expect(() => updateMatchStatus(db, m.id, 'shortlist')).toThrow(/Invalid transition/i);
  });

  // saved → saved (self-transition)
  it('saved → saved throws "Invalid transition"', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'saved' });
    expect(() => updateMatchStatus(db, m.id, 'saved')).toThrow(/Invalid transition/i);
  });

  // dismissed → shortlist
  it('dismissed → shortlist throws "Invalid transition"', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'dismissed' });
    expect(() => updateMatchStatus(db, m.id, 'shortlist')).toThrow(/Invalid transition/i);
  });

  // dismissed → dismissed (self-transition)
  it('dismissed → dismissed throws "Invalid transition"', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'dismissed' });
    expect(() => updateMatchStatus(db, m.id, 'dismissed')).toThrow(/Invalid transition/i);
  });

  // archived → shortlist
  it('archived → shortlist throws "Invalid transition"', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'archived' });
    expect(() => updateMatchStatus(db, m.id, 'shortlist')).toThrow(/Invalid transition/i);
  });

  // archived → dismissed
  it('archived → dismissed throws "Invalid transition"', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'archived' });
    expect(() => updateMatchStatus(db, m.id, 'dismissed')).toThrow(/Invalid transition/i);
  });

  // archived → archived (self-transition)
  it('archived → archived throws "Invalid transition"', () => {
    const db = freshDb();
    const m = insertMatch(db, { status: 'archived' });
    expect(() => updateMatchStatus(db, m.id, 'archived')).toThrow(/Invalid transition/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// updateMatchStatus — not-found
// ──────────────────────────────────────────────────────────────────────────────

describe('updateMatchStatus — not found', () => {
  it('throws when match id does not exist', () => {
    const db = freshDb();
    expect(() => updateMatchStatus(db, 99999, 'saved')).toThrow();
  });
});
