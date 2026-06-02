/**
 * Adversarial regression tests — Layer C (matching-cap)
 * test-skill cold-start review 2026-06-02
 *
 * Attacks:
 *   A1 — LIMIT option silently ignored in topPerCargo path
 *   A2 — destCrane missing breakbulk cargoType warning
 *   A3 — verdictBadge with warning=true + pass=false
 *   A4 — score_min combined with topPerCargo
 */
import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import { createMatch, listMatches } from '@/lib/matching/matches-repository';
import { checkCrane, runHardFilters } from '@/lib/sailing/match-filters';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  return db;
}

function insertFit(
  db: Database.Database,
  cargo_id: string,
  vessel_id: string,
  fit_percent: number,
  status: 'shortlist' | 'saved' | 'dismissed' | 'archived' = 'shortlist',
) {
  return createMatch(db, { cargo_id, vessel_id, score: fit_percent, reason: '{}', fit_percent, status });
}

// ────────────────────────────────────────────────────────────────────────────
// A1 — LIMIT option silently ignored in topPerCargo path
// ────────────────────────────────────────────────────────────────────────────
describe('A1 — topPerCargo respects limit/offset (GAP-1 fix)', () => {
  it('limit is respected in topPerCargo path', () => {
    const db = freshDb();
    // 6 for cargo-A, 6 for cargo-B → topPerCargo=3 → 6 total; limit=2 → 2
    for (let i = 0; i < 6; i++) {
      insertFit(db, 'cargo-A', `v-a${i}`, 90 - i * 5);
      insertFit(db, 'cargo-B', `v-b${i}`, 90 - i * 5);
    }
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', topPerCargo: 3, limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('offset is respected in topPerCargo path', () => {
    const db = freshDb();
    for (let i = 0; i < 6; i++) {
      insertFit(db, 'cargo-A', `v-a${i}`, 90 - i * 5);
    }
    const all = listMatches(db, { sortBy: 'score', sortDir: 'desc', topPerCargo: 3 });
    const withOffset = listMatches(db, { sortBy: 'score', sortDir: 'desc', topPerCargo: 3, offset: 1 });
    expect(withOffset).toHaveLength(all.length - 1);
    expect(withOffset[0].id).toBe(all[1].id);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// A2 — destCrane missing breakbulk cargoType warning
// ────────────────────────────────────────────────────────────────────────────
describe('A2 — destCrane missing breakbulk warning', () => {
  it('destCrane gets breakbulk amber when discharge port unverified (GAP-2 fix)', () => {
    // BREAK_BULK + gearless: origin Mykolaiv (cranes confirmed) + dest Atlantis (unknown)
    const result = runHardFilters({
      cargoType: 'BREAK_BULK',
      originPort: 'Mykolaiv',      // has shore cranes → origin crane OK, no warning
      destinationPort: 'Atlantis', // unknown cranes → should warn
      geared: false,
      weightMt: 5000,
      cargoDescription: 'steel coils',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      draftMax: 10,
      grainCapacity: 50000,
      dwtSummer: 30000,
      dwcc: null,
    });
    // Origin crane: Mykolaiv has cranes → no warning
    expect(result.checks.crane.pass).toBe(true);
    expect(result.checks.crane.warning).toBeFalsy();
    // Destination crane: Atlantis unknown + BREAK_BULK → amber warning
    expect(result.checks.destCrane.pass).toBe(true);
    expect(result.checks.destCrane.warning).toBe(true);
    expect(result.checks.destCrane.reason).toMatch(/confirm.cranes/i);
  });

  it('DIRECT: checkCrane with BREAK_BULK for unknown port gives warning', () => {
    // Direct call with cargoType (as checkCrane was updated)
    const r = checkCrane('Atlantis', false, 'BREAK_BULK');
    expect(r.pass).toBe(true);
    expect(r.warning).toBe(true);
    expect(r.reason).toMatch(/confirm.cranes/i);
  });

  it('DIRECT: checkCrane WITHOUT cargoType for unknown port gives NO warning', () => {
    // When cargoType is omitted (as in destCrane call in runHardFilters)
    const r = checkCrane('Atlantis', false);
    expect(r.pass).toBe(true);
    expect(r.warning).toBeFalsy(); // confirms the gap
  });
});

// ────────────────────────────────────────────────────────────────────────────
// A3 — verdictBadge with warning=true + pass=false edge case
// ────────────────────────────────────────────────────────────────────────────
describe('A3 — warning state invariants', () => {
  it('checkCrane amber cases always return pass=true (contract)', () => {
    // Amber warning must never occur with pass=false
    const r1 = checkCrane('Atlantis', false, 'BREAK_BULK');
    if (r1.warning) {
      expect(r1.pass).toBe(true); // warning implies pass
    }

    const r2 = checkCrane('Atlantis', false, 'BULK');
    expect(r2.warning).toBeFalsy(); // bulk: no warning

    const r3 = checkCrane('Mykolaiv', false, 'BREAK_BULK');
    expect(r3.warning).toBeFalsy(); // confirmed cranes: no warning
  });

  it('crane failure (no cranes) does NOT produce warning flag', () => {
    const r = checkCrane('Skikda', false, 'BREAK_BULK');
    // Skikda has no shore cranes → hard fail
    expect(r.pass).toBe(false);
    expect(r.warning).toBeFalsy(); // failures don't use warning flag
  });
});

// ────────────────────────────────────────────────────────────────────────────
// A4 — score_min combined with topPerCargo
// ────────────────────────────────────────────────────────────────────────────
describe('A4 — score_min + topPerCargo interaction', () => {
  it('score_min filter applies before ranking in topPerCargo path', () => {
    const db = freshDb();
    // 5 matches: fit [90,80,70,60,50], score matches fit
    for (let i = 0; i < 5; i++) {
      insertFit(db, 'cargo-A', `v${i}`, 90 - i * 10);
    }
    // score_min=65 → only fit [90,80,70] qualify; topPerCargo=2 → top 2 → [90,80]
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', topPerCargo: 2, score_min: 65 });
    expect(results).toHaveLength(2);
    const fits = results.map(r => r.fit_percent).sort((a, b) => (b ?? 0) - (a ?? 0));
    expect(fits).toEqual([90, 80]);
  });
});
