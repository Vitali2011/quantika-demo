import Database from 'better-sqlite3';
import migration026 from '../migrations/026-charterers';
import {
  getCharterer,
  listCharterers,
  upsertCharterer,
  deleteCharterer,
  type ChartererRow,
} from '../market/charterers-repository';

/**
 * Input Contract for charterers-repository:
 *
 * getCharterer(db, id):
 * - Empty id ("", null, undefined) → return null (no match)
 * - Non-existent id → return null
 *
 * listCharterers(db, tier?):
 * - Empty tier ("", null, undefined) → return all (no filter)
 * - Invalid tier → return [] (no match)
 * - Valid tier → filter by tier
 *
 * upsertCharterer(db, row):
 * - Empty name ("", null, undefined) → DB constraint error (NOT NULL)
 * - Invalid tier → DB CHECK constraint error
 * - Non-integer require_lc (2, 3, -1) → coerce to 0 or 1
 * - Duplicate name → ON CONFLICT UPDATE
 *
 * deleteCharterer(db, id):
 * - Empty id ("", null, undefined) → silent no-op
 * - Non-existent id → silent no-op
 */

describe('charterers-repository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
  });

  afterEach(() => {
    db.close();
  });

  // RED test: upsertCharterer creates record
  it('upsertCharterer creates a new charterer record', () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: 'Top tier charterer',
    });

    const row = getCharterer(db, 'c1');
    expect(row).not.toBeNull();
    expect(row!.name).toBe('Cargill');
    expect(row!.tier).toBe('blue-chip');
    expect(row!.require_lc).toBe(0);
  });

  // RED test: getCharterer returns null for missing id (boundary: non-existent id)
  it('getCharterer returns null for non-existent id', () => {
    const row = getCharterer(db, 'non-existent-id');
    expect(row).toBeNull();
  });

  // RED test: getCharterer returns null for empty id (boundary: empty string)
  it('getCharterer returns null for empty id', () => {
    const row = getCharterer(db, '');
    expect(row).toBeNull();
  });

  // RED test: listCharterers filters by tier
  it('listCharterers filters by tier', () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    upsertCharterer(db, {
      id: 'c2',
      name: 'Second Corp',
      tier: 'second',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const blueChip = listCharterers(db, 'blue-chip');
    expect(blueChip).toHaveLength(1);
    expect(blueChip[0].name).toBe('Cargill');

    const second = listCharterers(db, 'second');
    expect(second).toHaveLength(1);
    expect(second[0].name).toBe('Second Corp');
  });

  // RED test: listCharterers returns all when no tier filter
  it('listCharterers returns all charterers when no tier filter provided', () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    upsertCharterer(db, {
      id: 'c2',
      name: 'Second Corp',
      tier: 'second',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const all = listCharterers(db);
    expect(all).toHaveLength(2);
  });

  // RED test: listCharterers returns empty array for invalid tier (boundary: invalid tier)
  it('listCharterers returns empty array for invalid tier', () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const result = listCharterers(db, 'invalid-tier');
    expect(result).toHaveLength(0);
  });

  // RED test: upsertCharterer updates existing record (ON CONFLICT)
  it('upsertCharterer updates existing record on conflict', () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: 'Initial note',
    });

    // Update same id with different data (including name)
    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill Updated',
      tier: 'second',
      payment_history: '[{"date":"2026-01-01","status":"paid"}]',
      require_lc: 1,
      notes: 'Updated note',
    });

    const row = getCharterer(db, 'c1');
    expect(row).not.toBeNull();
    expect(row!.name).toBe('Cargill Updated');
    expect(row!.tier).toBe('second');
    expect(row!.require_lc).toBe(1);
    expect(row!.notes).toBe('Updated note');
  });

  // RED test: deleteCharterer removes record
  it('deleteCharterer removes record', () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    deleteCharterer(db, 'c1');

    const row = getCharterer(db, 'c1');
    expect(row).toBeNull();
  });

  // RED test: deleteCharterer is no-op for non-existent id (boundary: non-existent id)
  it('deleteCharterer is no-op for non-existent id', () => {
    expect(() => {
      deleteCharterer(db, 'non-existent');
    }).not.toThrow();
  });

  // RED test: deleteCharterer is no-op for empty id (boundary: empty string)
  it('deleteCharterer is no-op for empty id', () => {
    expect(() => {
      deleteCharterer(db, '');
    }).not.toThrow();
  });

  // RED test: require_lc stored as 0/1 integer
  it('require_lc is stored and retrieved as 0 or 1 integer', () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Corp 1',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    upsertCharterer(db, {
      id: 'c2',
      name: 'Corp 2',
      tier: 'second',
      payment_history: '[]',
      require_lc: 1,
      notes: null,
    });

    const row1 = getCharterer(db, 'c1');
    const row2 = getCharterer(db, 'c2');

    expect(row1!.require_lc).toBe(0);
    expect(row2!.require_lc).toBe(1);
    expect(typeof row1!.require_lc).toBe('number');
    expect(typeof row2!.require_lc).toBe('number');
  });

  // RED test: empty name throws constraint error (boundary: empty name)
  it('upsertCharterer throws constraint error for empty name', () => {
    expect(() => {
      upsertCharterer(db, {
        id: 'c1',
        name: '',
        tier: 'blue-chip',
        payment_history: '[]',
        require_lc: 0,
        notes: null,
      });
    }).toThrow();
  });

  // RED test: null name throws constraint error (boundary: null name)
  it('upsertCharterer throws constraint error for null name', () => {
    expect(() => {
      upsertCharterer(db, {
        id: 'c1',
        name: null as any,
        tier: 'blue-chip',
        payment_history: '[]',
        require_lc: 0,
        notes: null,
      });
    }).toThrow();
  });

  // RED test: invalid tier throws CHECK constraint error (boundary: invalid tier)
  it('upsertCharterer throws CHECK constraint error for invalid tier', () => {
    expect(() => {
      upsertCharterer(db, {
        id: 'c1',
        name: 'Test Corp',
        tier: 'invalid-tier' as any,
        payment_history: '[]',
        require_lc: 0,
        notes: null,
      });
    }).toThrow(/CHECK constraint/i);
  });

  // RED test: negative require_lc (boundary: negative in positive domain)
  // Repository will accept it, but we'll normalize to 0/1 in implementation
  it('upsertCharterer coerces negative require_lc to 0', () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Test Corp',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: -1 as any,
      notes: null,
    });

    const row = getCharterer(db, 'c1');
    expect(row).not.toBeNull();
    expect(row!.require_lc).toBe(0);
  });

  // RED test: require_lc > 1 coerced to 1 (boundary: out-of-range)
  it('upsertCharterer coerces require_lc > 1 to 1', () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Test Corp',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 5 as any,
      notes: null,
    });

    const row = getCharterer(db, 'c1');
    expect(row).not.toBeNull();
    expect(row!.require_lc).toBe(1);
  });
});
