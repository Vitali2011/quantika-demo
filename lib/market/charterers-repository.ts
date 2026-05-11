import type Database from 'better-sqlite3';

export interface ChartererRow {
  id: string;
  name: string;
  tier: 'blue-chip' | 'second' | 'weak';
  payment_history: string; // JSON array of {date, status, notes}
  require_lc: number; // 0 | 1
  notes: string | null;
  created_at: string;
}

/**
 * Input Contract:
 * - id: empty ("", null, undefined) → return null (no match)
 * - id: non-existent → return null
 */
export function getCharterer(
  db: Database.Database,
  id: string
): ChartererRow | null {
  if (!id) return null;

  const row = db
    .prepare<[string], ChartererRow>(
      `SELECT id, name, tier, payment_history, require_lc, notes, created_at
       FROM charterers
       WHERE id = ?`
    )
    .get(id);

  return row ?? null;
}

/**
 * Input Contract:
 * - tier: empty ("", null, undefined) → return all (no filter)
 * - tier: invalid → return [] (no match)
 * - tier: valid → filter by tier
 */
export function listCharterers(
  db: Database.Database,
  tier?: string
): ChartererRow[] {
  if (!tier) {
    return db
      .prepare<[], ChartererRow>(
        `SELECT id, name, tier, payment_history, require_lc, notes, created_at
         FROM charterers
         ORDER BY name ASC`
      )
      .all();
  }

  return db
    .prepare<[string], ChartererRow>(
      `SELECT id, name, tier, payment_history, require_lc, notes, created_at
       FROM charterers
       WHERE tier = ?
       ORDER BY name ASC`
    )
    .all(tier);
}

/**
 * Input Contract:
 * - name: empty ("", null, undefined) → DB constraint error (NOT NULL)
 * - tier: invalid → DB CHECK constraint error
 * - require_lc: negative or > 1 → coerce to 0 or 1
 * - duplicate name → ON CONFLICT UPDATE
 */
export function upsertCharterer(
  db: Database.Database,
  row: Omit<ChartererRow, 'created_at'>
): void {
  // Validate name is not empty
  if (!row.name || row.name.trim() === '') {
    throw new Error('Charterer name cannot be empty');
  }

  // Normalize require_lc to 0 or 1
  const normalizedRequireLc = row.require_lc > 0 ? 1 : 0;

  db.prepare(
    `INSERT INTO charterers (id, name, tier, payment_history, require_lc, notes)
     VALUES (@id, @name, @tier, @payment_history, @require_lc, @notes)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       tier = excluded.tier,
       payment_history = excluded.payment_history,
       require_lc = excluded.require_lc,
       notes = excluded.notes`
  ).run({
    id: row.id,
    name: row.name,
    tier: row.tier,
    payment_history: row.payment_history,
    require_lc: normalizedRequireLc,
    notes: row.notes,
  });
}

/**
 * Input Contract:
 * - id: empty ("", null, undefined) → silent no-op
 * - id: non-existent → silent no-op
 */
export function deleteCharterer(db: Database.Database, id: string): void {
  if (!id) return;

  db.prepare(`DELETE FROM charterers WHERE id = ?`).run(id);
}
