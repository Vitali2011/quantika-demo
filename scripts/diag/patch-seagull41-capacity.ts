/**
 * patch-seagull41-capacity.ts
 *
 * Corrects SEAGULL 41 (emailId=19e07d53e7d46b71, itemIndex=1) capacity data:
 *   C1 — correct grainCapacity=3994 cbm, baleCapacity=3994 cbm;
 *         dedup parsed_results (keep lowest rowid, delete the other dup rows)
 *   C2 — recompute volume fit component in seeded matches (user_id IS NULL),
 *         clearing the baked "cargo overflows the holds" from regen time
 *   C3 — delete stale per-session copies (user_id NOT NULL, not demo sentinels)
 *         so they rebuild from the corrected seed on next login
 *
 * Usage:
 *   npx tsx scripts/diag/patch-seagull41-capacity.ts              # --dry (default)
 *   npx tsx scripts/diag/patch-seagull41-capacity.ts --apply --ts 1749600000
 *   npx tsx scripts/diag/patch-seagull41-capacity.ts --fixture    # fixture self-test
 *
 * DB path: process.env.SESSIONS_DB_PATH (fallback: data/demo-seed.db)
 * --apply requires --ts <unix_seconds> for the backup filename.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { scoreVolume } from '../../lib/sailing/fit-breakdown';

// ── Constants ─────────────────────────────────────────────────────────────────

const EMAIL_ID = '19e07d53e7d46b71';
const ITEM_INDEX = 1;
const CORRECTED_GRAIN_CBM = 3994;
const CORRECTED_GRAIN_UNIT = 'cbm';
const CORRECTED_BALE_CBM = 3994;
const DEMO_SENTINELS = ['__demo_review__', '__demo_insufficient__'];

// ── Inline types (mirror lib/types FitBreakdown — avoids circular import) ────

interface FbComponent {
  factor: string;
  label: string;
  weight: number;
  score: number;
  rationale: string;
}

interface FbBreakdown {
  components: FbComponent[];
  totalWeight: number;
  fitPercent: number;
  partCargo: boolean;
  vesselClass: string;
  sanctionsPenalty: number;
  chartererPenalty?: number;
  appliedCap: { reason: string; ceiling: number } | null;
  inputs: { cargoWtMax: number | null; [k: string]: unknown };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cfValue<T>(field: { value: T } | null | undefined): T | null {
  return field?.value ?? null;
}

/** Replace volume component and recompute fitPercent (mirrors patchEconomicsComponent). */
function patchVolumeInBreakdown(breakdown: FbBreakdown, newVolume: FbComponent): FbBreakdown {
  const components = breakdown.components.map(c => c.factor === 'volume' ? newVolume : c);
  const rawSum = components.reduce((a, c) => a + c.score, 0);
  const sanctionsPenalty = breakdown.sanctionsPenalty ?? 0;
  const chartererPenalty = breakdown.chartererPenalty ?? 0;
  let fit = rawSum - sanctionsPenalty - chartererPenalty;
  if (breakdown.appliedCap != null && fit > breakdown.appliedCap.ceiling) {
    fit = breakdown.appliedCap.ceiling;
  }
  const fitPercent = Math.max(0, Math.min(100, Math.round(fit * 10) / 10));
  return { ...breakdown, components, fitPercent };
}

function sep(char = '─', width = 72): string { return char.repeat(width); }

// ── Locate ────────────────────────────────────────────────────────────────────

interface VesselRow {
  rowid: number;
  result_json: string;
  vessel: Record<string, unknown>; // the target vessel object within the JSON array
  currentGrain: number | null;
  currentGrainUnit: string | null;
  currentBale: number | null;
}

interface SeededMatch {
  id: number;
  cargo_id: string;
  cargo_item_index: number;
  fit_percent: number | null;
  fit_breakdown: string | null;
  breakdown: FbBreakdown | null;
}

interface Located {
  vesselRows: VesselRow[];
  seededMatches: SeededMatch[];
  staleSessionCount: number;
}

function locate(db: Database.Database): Located {
  // A1: duplicate vessel rows
  const rawVesselRows = db.prepare(
    `SELECT rowid, result_json FROM parsed_results
     WHERE parse_type='vessel' AND result_json LIKE ?
     ORDER BY rowid ASC`,
  ).all(`%${EMAIL_ID}%`) as Array<{ rowid: number; result_json: string }>;

  const vesselRows: VesselRow[] = [];
  for (const row of rawVesselRows) {
    let arr: unknown[];
    try { arr = JSON.parse(row.result_json); } catch { arr = []; }
    const vessel = arr.find(
      (v): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null &&
        (v as Record<string, unknown>)['emailId'] === EMAIL_ID &&
        (v as Record<string, unknown>)['itemIndex'] === ITEM_INDEX,
    );
    if (!vessel) continue;
    vesselRows.push({
      rowid: row.rowid,
      result_json: row.result_json,
      vessel,
      currentGrain: typeof vessel['grainCapacity'] === 'number' ? vessel['grainCapacity'] as number : null,
      currentGrainUnit: typeof vessel['grainCapacityUnit'] === 'string' ? vessel['grainCapacityUnit'] as string : null,
      currentBale: typeof vessel['baleCapacity'] === 'number' ? vessel['baleCapacity'] as number : null,
    });
  }

  // A2: seeded matches (user_id IS NULL)
  const rawMatches = db.prepare(
    `SELECT id, cargo_id,
            COALESCE(cargo_item_index, 0) AS cargo_item_index,
            fit_percent, fit_breakdown
     FROM matches
     WHERE vessel_id=? AND user_id IS NULL`,
  ).all(EMAIL_ID) as Array<{ id: number; cargo_id: string; cargo_item_index: number; fit_percent: number | null; fit_breakdown: string | null }>;

  const seededMatches: SeededMatch[] = rawMatches.map(m => {
    let breakdown: FbBreakdown | null = null;
    if (m.fit_breakdown) {
      try { breakdown = JSON.parse(m.fit_breakdown) as FbBreakdown; } catch { /* noop */ }
    }
    return { ...m, breakdown };
  });

  // A3: stale per-session count
  const placeholders = DEMO_SENTINELS.map(() => '?').join(',');
  const staleRow = db.prepare(
    `SELECT count(*) AS n FROM matches
     WHERE vessel_id=? AND user_id IS NOT NULL
       AND user_id NOT IN (${placeholders})`,
  ).get(EMAIL_ID, ...DEMO_SENTINELS) as { n: number };
  const staleSessionCount = staleRow?.n ?? 0;

  return { vesselRows, seededMatches, staleSessionCount };
}

// ── C1: build corrected vessel JSON ───────────────────────────────────────────

interface C1Plan {
  keepRowid: number;
  deleteRowids: number[];
  correctedJson: string;
}

function buildC1Plan(vesselRows: VesselRow[]): C1Plan | null {
  if (vesselRows.length === 0) return null;
  const sorted = [...vesselRows].sort((a, b) => a.rowid - b.rowid);
  const keep = sorted[0];
  const deleteRowids = sorted.slice(1).map(r => r.rowid);

  // Parse the full array, correct the target vessel, leave others untouched
  let arr: unknown[];
  try { arr = JSON.parse(keep.result_json); } catch { arr = []; }
  const correctedArr = arr.map(v => {
    if (
      typeof v === 'object' && v !== null &&
      (v as Record<string, unknown>)['emailId'] === EMAIL_ID &&
      (v as Record<string, unknown>)['itemIndex'] === ITEM_INDEX
    ) {
      return {
        ...(v as Record<string, unknown>),
        grainCapacity: CORRECTED_GRAIN_CBM,
        grainCapacityUnit: CORRECTED_GRAIN_UNIT,
        baleCapacity: CORRECTED_BALE_CBM,
      };
    }
    return v;
  });

  return {
    keepRowid: keep.rowid,
    deleteRowids,
    correctedJson: JSON.stringify(correctedArr),
  };
}

// ── C2: recompute volume in seeded matches ─────────────────────────────────────

interface C2MatchPlan {
  matchId: number;
  cargo_id: string;
  cargo_item_index: number;
  cargoWtMax: number | null;
  cargoDescription: string | null;
  stowageFactor: string | null;
  oldVolume: FbComponent | null;
  newVolume: FbComponent | null;
  oldFitPercent: number | null;
  newFitPercent: number | null;
  newBreakdownJson: string | null;
  skip: boolean;
  skipReason?: string;
}

function buildC2Plans(db: Database.Database, seededMatches: SeededMatch[]): C2MatchPlan[] {
  return seededMatches.map(m => {
    const base: Omit<C2MatchPlan, 'oldVolume' | 'newVolume' | 'oldFitPercent' | 'newFitPercent' | 'newBreakdownJson'> = {
      matchId: m.id,
      cargo_id: m.cargo_id,
      cargo_item_index: m.cargo_item_index,
      cargoWtMax: m.breakdown?.inputs?.cargoWtMax ?? null,
      cargoDescription: null,
      stowageFactor: null,
      skip: false,
    };

    if (!m.breakdown) {
      return { ...base, oldVolume: null, newVolume: null, oldFitPercent: null, newFitPercent: null, newBreakdownJson: null, skip: true, skipReason: 'no fit_breakdown' };
    }

    const cargoWtMax = m.breakdown.inputs?.cargoWtMax ?? null;

    // Look up cargo from parsed_results
    let cargoDescription: string | null = null;
    let stowageFactor: string | null = null;
    try {
      const cargoRows = db.prepare(
        `SELECT result_json FROM parsed_results WHERE parse_type='cargo' AND result_json LIKE ? LIMIT 5`,
      ).all(`%${m.cargo_id}%`) as Array<{ result_json: string }>;

      for (const cr of cargoRows) {
        let arr: unknown[];
        try { arr = JSON.parse(cr.result_json); } catch { continue; }
        const cargo = arr.find(
          (c): c is Record<string, unknown> =>
            typeof c === 'object' && c !== null &&
            (c as Record<string, unknown>)['emailId'] === m.cargo_id &&
            (c as Record<string, unknown>)['itemIndex'] === m.cargo_item_index,
        );
        if (cargo) {
          const descField = cargo['cargoDescription'];
          cargoDescription = cfValue(descField as ({ value: string } | null));
          stowageFactor = typeof cargo['stowageFactor'] === 'string' ? cargo['stowageFactor'] as string : null;
          break;
        }
      }
    } catch (err) {
      return { ...base, cargoWtMax, cargoDescription: null, stowageFactor: null, oldVolume: null, newVolume: null, oldFitPercent: null, newFitPercent: null, newBreakdownJson: null, skip: true, skipReason: `cargo lookup failed: ${err}` };
    }

    const oldVolume = m.breakdown.components.find(c => c.factor === 'volume') ?? null;
    const newVolume = scoreVolume(cargoWtMax, cargoDescription, CORRECTED_GRAIN_CBM, stowageFactor);
    const patchedBreakdown = patchVolumeInBreakdown(m.breakdown, newVolume as FbComponent);

    return {
      ...base,
      cargoWtMax,
      cargoDescription,
      stowageFactor,
      oldVolume: oldVolume ?? null,
      newVolume: newVolume as FbComponent,
      oldFitPercent: m.fit_percent,
      newFitPercent: patchedBreakdown.fitPercent,
      newBreakdownJson: JSON.stringify(patchedBreakdown),
      skip: false,
    };
  });
}

// ── Dry receipt ───────────────────────────────────────────────────────────────

function printReceipt(
  located: Located,
  c1: C1Plan | null,
  c2Plans: C2MatchPlan[],
  label = 'DRY RUN',
): void {
  console.log(`\n${sep('═')}`);
  console.log(`  SEAGULL 41 capacity patch — ${label}`);
  console.log(sep('═'));

  // LOCATE summary
  console.log('\n── A · LOCATE ─────────────────────────────────────────────');
  if (located.vesselRows.length === 0) {
    console.log('  [WARN] No vessel rows found for emailId=' + EMAIL_ID);
  } else {
    console.log(`  Found ${located.vesselRows.length} parsed_results vessel row(s):`);
    for (const vr of located.vesselRows) {
      console.log(`    rowid=${vr.rowid}  grain=${vr.currentGrain} ${vr.currentGrainUnit ?? '?'}  bale=${vr.currentBale ?? '?'}`);
    }
  }
  console.log(`  Found ${located.seededMatches.length} seeded match(es) (user_id IS NULL)`);
  console.log(`  Found ${located.staleSessionCount} stale per-session match(es) to delete`);

  // C1 plan
  console.log('\n── C1 · parsed_results CORRECT + DEDUP ────────────────────');
  if (!c1) {
    console.log('  [SKIP] No vessel rows found — nothing to correct');
  } else {
    console.log(`  KEEP   rowid=${c1.keepRowid}  → grain=${CORRECTED_GRAIN_CBM} ${CORRECTED_GRAIN_UNIT}  bale=${CORRECTED_BALE_CBM}`);
    if (c1.deleteRowids.length > 0) {
      console.log(`  DELETE rowid(s)=${c1.deleteRowids.join(',')}  (dup rows for same emailId/itemIndex)`);
    } else {
      console.log('  DELETE (none — only 1 row found)');
    }
  }

  // C2 plan
  console.log('\n── C2 · seeded matches volume recompute ────────────────────');
  if (c2Plans.length === 0) {
    console.log('  [SKIP] No seeded matches found');
  }
  for (const p of c2Plans) {
    if (p.skip) {
      console.log(`  [SKIP] match id=${p.matchId} cargo=${p.cargo_id} — ${p.skipReason}`);
      continue;
    }
    const oldRat = p.oldVolume?.rationale ?? '(none)';
    const newRat = p.newVolume?.rationale ?? '(none)';
    const overflow = oldRat.includes('overflows the holds') ? ' ⚠ OVERFLOW' : '';
    console.log(`  match id=${p.matchId}  cargo=${p.cargo_id}[${p.cargo_item_index}]  cargoWtMax=${p.cargoWtMax}`);
    console.log(`    cargoDesc=${p.cargoDescription ?? '(null)'}  sf=${p.stowageFactor ?? '(null→default)'}`);
    console.log(`    volume BEFORE: score=${p.oldVolume?.score ?? '?'}  "${oldRat.slice(0, 80)}"${overflow}`);
    console.log(`    volume AFTER:  score=${p.newVolume?.score ?? '?'}  "${newRat.slice(0, 80)}"`);
    console.log(`    fitPercent: ${p.oldFitPercent} → ${p.newFitPercent}`);
  }

  // C3 plan
  console.log('\n── C3 · stale per-session copies ──────────────────────────');
  if (located.staleSessionCount === 0) {
    console.log('  [SKIP] No stale per-session matches found');
  } else {
    console.log(`  DELETE ${located.staleSessionCount} row(s) WHERE vessel_id='${EMAIL_ID}' AND user_id NOT IN sentinels AND user_id IS NOT NULL`);
  }

  console.log(`\n${sep('─')}`);
  console.log(`  ${label}: ${c1 ? 1 : 0} vessel row corrected, ${c1?.deleteRowids.length ?? 0} dup rows deleted`);
  console.log(`  ${c2Plans.filter(p => !p.skip).length} seeded match fit_breakdowns recomputed`);
  console.log(`  ${located.staleSessionCount} stale session matches queued for delete`);
  console.log(sep('─'));
}

// ── Verify ────────────────────────────────────────────────────────────────────

function verify(db: Database.Database): void {
  console.log('\n── D · VERIFY ──────────────────────────────────────────────');

  // D1: exactly 1 vessel row, correct values
  const vRows = db.prepare(
    `SELECT rowid, result_json FROM parsed_results
     WHERE parse_type='vessel' AND result_json LIKE ?`,
  ).all(`%${EMAIL_ID}%`) as Array<{ rowid: number; result_json: string }>;

  const d1Pass = vRows.length === 1;
  console.log(`  D1 vessel row count = ${vRows.length}  ${d1Pass ? '✓ PASS (expect 1)' : '✗ FAIL (expect 1)'}`);

  for (const vr of vRows) {
    let arr: unknown[];
    try { arr = JSON.parse(vr.result_json); } catch { arr = []; }
    const vessel = arr.find(
      (v): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null &&
        (v as Record<string, unknown>)['emailId'] === EMAIL_ID &&
        (v as Record<string, unknown>)['itemIndex'] === ITEM_INDEX,
    );
    if (!vessel) { console.log(`    pr-rowid=${vr.rowid}: target vessel not found in JSON`); continue; }
    const grain = vessel['grainCapacity'];
    const unit = vessel['grainCapacityUnit'];
    const bale = vessel['baleCapacity'];
    const ok = grain === CORRECTED_GRAIN_CBM && unit === CORRECTED_GRAIN_UNIT && bale === CORRECTED_BALE_CBM;
    console.log(`    pr-rowid=${vr.rowid}: grain=${grain} ${unit}  bale=${bale}  ${ok ? '✓' : '✗ WRONG'}`);
  }

  // D2: no seeded match overflow, volume ratio < 1
  const seededRows = db.prepare(
    `SELECT id, fit_percent, fit_breakdown FROM matches WHERE vessel_id=? AND user_id IS NULL`,
  ).all(EMAIL_ID) as Array<{ id: number; fit_percent: number | null; fit_breakdown: string | null }>;

  let d2Pass = true;
  console.log(`  D2 seeded matches (${seededRows.length} rows):`);
  for (const mr of seededRows) {
    if (!mr.fit_breakdown) { console.log(`    id=${mr.id}: no fit_breakdown`); continue; }
    let fb: FbBreakdown;
    try { fb = JSON.parse(mr.fit_breakdown); } catch { console.log(`    id=${mr.id}: parse error`); continue; }
    const vol = fb.components.find(c => c.factor === 'volume');
    const overflow = vol?.rationale?.includes('overflows the holds') ?? false;
    const ratPct = vol?.rationale?.match(/~(\d+)%/) ? parseInt(vol.rationale.match(/~(\d+)%/)![1]) : null;
    const ratioOk = ratPct !== null ? ratPct < 100 : true;
    if (overflow) d2Pass = false;
    console.log(`    id=${mr.id}: fit%=${mr.fit_percent}  vol_score=${vol?.score ?? '?'}  ratio~${ratPct ?? '?'}%  overflow=${overflow}  ${!overflow && ratioOk ? '✓' : '✗ STILL OVERFLOW'}`);
  }
  console.log(`  D2 no overflow: ${d2Pass ? '✓ PASS' : '✗ FAIL'}`);
}

// ── Apply ─────────────────────────────────────────────────────────────────────

function applyChanges(
  db: Database.Database,
  c1: C1Plan | null,
  c2Plans: C2MatchPlan[],
  staleSessionCount: number,
): void {
  const placeholders = DEMO_SENTINELS.map(() => '?').join(',');

  db.transaction(() => {
    // C1
    if (c1) {
      db.prepare(`UPDATE parsed_results SET result_json=? WHERE rowid=?`)
        .run(c1.correctedJson, c1.keepRowid);
      if (c1.deleteRowids.length > 0) {
        const delPlaceholders = c1.deleteRowids.map(() => '?').join(',');
        db.prepare(`DELETE FROM parsed_results WHERE parse_type='vessel' AND result_json LIKE ? AND rowid IN (${delPlaceholders})`)
          .run(`%${EMAIL_ID}%`, ...c1.deleteRowids);
      }
    }

    // C2
    for (const p of c2Plans) {
      if (p.skip || p.newBreakdownJson === null) continue;
      db.prepare(`UPDATE matches SET fit_breakdown=?, fit_percent=? WHERE id=?`)
        .run(p.newBreakdownJson, p.newFitPercent, p.matchId);
    }

    // C3
    db.prepare(
      `DELETE FROM matches WHERE vessel_id=? AND user_id IS NOT NULL AND user_id NOT IN (${placeholders})`,
    ).run(EMAIL_ID, ...DEMO_SENTINELS);
  })();
}

// ── Fixture ───────────────────────────────────────────────────────────────────

function buildFixtureDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE parsed_results (
      parse_type  TEXT NOT NULL,
      result_json TEXT NOT NULL
    );
    CREATE TABLE matches (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      cargo_id          TEXT NOT NULL,
      vessel_id         TEXT NOT NULL,
      score             INTEGER NOT NULL DEFAULT 0,
      reason            TEXT NOT NULL DEFAULT '',
      status            TEXT NOT NULL DEFAULT 'shortlist',
      user_id           TEXT,
      created_at        INTEGER NOT NULL DEFAULT 0,
      updated_at        INTEGER NOT NULL DEFAULT 0,
      fit_percent       REAL,
      fit_breakdown     TEXT,
      cargo_item_index  INTEGER NOT NULL DEFAULT 0,
      vessel_item_index INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Three vessel rows with conflicting grain values (rowid assigned in insert order)
  // Row 1 (first/lowest rowid): grainCapacity=3994 cbft — what display .find() returns
  // Row 2: grainCapacity=6246 cbm (220577 cbft ÷ 35.315 ≈ 6246)
  // Row 3 (last): grainCapacity=113 cbm (3994 cbft ÷ 35.315 ≈ 113) — what persist Map uses
  const makeVesselJson = (grain: number, unit: string, bale: number) => JSON.stringify([
    {
      emailId: EMAIL_ID,
      itemIndex: ITEM_INDEX,
      vesselName: { value: 'MV SEAGULL 41', confidence: 'high' },
      imo: '9999041',
      grainCapacity: grain,
      grainCapacityUnit: unit,
      baleCapacity: bale,
      dwtSummer: { value: 3178, confidence: 'high' },
    },
  ]);

  const insertVessel = db.prepare(`INSERT INTO parsed_results (parse_type, result_json) VALUES ('vessel', ?)`);
  insertVessel.run(makeVesselJson(3994, 'cbft', 12799));   // row 1 — display path
  insertVessel.run(makeVesselJson(6246, 'cbm', 12799));    // row 2
  insertVessel.run(makeVesselJson(113, 'cbm', 362));       // row 3 — persist path

  // Cargo rows (cargo-fixture-x1 and cargo-fixture-x2)
  const insertCargo = db.prepare(`INSERT INTO parsed_results (parse_type, result_json) VALUES ('cargo', ?)`);
  const makeCargo = (id: string) => JSON.stringify([
    {
      emailId: id,
      itemIndex: 0,
      cargoDescription: { value: 'corn', confidence: 'high' },
      weightMt: { value: 500, confidence: 'high' },
      weightMtMax: 500,
      stowageFactor: null,
      cargoType: 'BULK',
    },
  ]);
  insertCargo.run(makeCargo('cargo-fixture-x1'));
  insertCargo.run(makeCargo('cargo-fixture-x2'));

  // Overflow fit_breakdown: grainCapacity=113 cbm, cargoWtMax=500 mt corn (sf=1.35)
  // requiredM3 = 500 * 1.35 = 675; ratio = 675/113 = 5.97 → overflow
  const overflowVolume: FbComponent = {
    factor: 'volume',
    label: 'Volume / hold fit',
    weight: 3,
    score: 0.8,
    rationale: "Cargo takes ~597% of the ship's grain capacity — cargo overflows the holds.",
  };
  const makeBreakdown = (cargoId: string): FbBreakdown => ({
    components: [
      { factor: 'utilisation', label: 'Utilisation', weight: 19, score: 14.2, rationale: 'Util 81% — good fill.' },
      { factor: 'timing', label: 'Timing', weight: 15, score: 11.3, rationale: 'Vessel open in laycan.' },
      { factor: 'ballast', label: 'Ballast', weight: 15, score: 9.0, rationale: '1200nm — manageable.' },
      { factor: 'classFit', label: 'Class fit', weight: 9, score: 6.8, rationale: 'Good DWT match.' },
      { factor: 'cargoType', label: 'Cargo type', weight: 6, score: 4.5, rationale: 'Bulk — no restriction.' },
      { factor: 'cranes', label: 'Cranes', weight: 6, score: 3.0, rationale: 'Geared vessel.' },
      overflowVolume,
      { factor: 'draft', label: 'Draft', weight: 2, score: 1.5, rationale: 'Within limit.' },
      { factor: 'vetting', label: 'Vetting', weight: 7, score: 4.9, rationale: 'Clean.' },
      { factor: 'economics', label: 'Economics', weight: 18, score: 13.5, rationale: 'TCE positive.' },
    ],
    totalWeight: 100,
    fitPercent: 69.5,
    partCargo: false,
    vesselClass: 'handysize',
    sanctionsPenalty: 0,
    chartererPenalty: 0,
    appliedCap: null,
    inputs: {
      cargoWtMax: 500,
      distanceNm: 1200,
      gapDays: 3,
      verdict: 'ready',
      utilisation: 0.81,
      vesselDwt: 3178,
    },
  });

  const insertMatch = db.prepare(
    `INSERT INTO matches (cargo_id, vessel_id, user_id, fit_percent, fit_breakdown, cargo_item_index)
     VALUES (?, ?, NULL, ?, ?, 0)`,
  );
  insertMatch.run('cargo-fixture-x1', EMAIL_ID, 69.5, JSON.stringify(makeBreakdown('cargo-fixture-x1')));
  insertMatch.run('cargo-fixture-x2', EMAIL_ID, 69.5, JSON.stringify(makeBreakdown('cargo-fixture-x2')));

  // Stale per-session copies
  db.prepare(
    `INSERT INTO matches (cargo_id, vessel_id, user_id, fit_percent, cargo_item_index)
     VALUES (?, ?, ?, ?, 0)`,
  ).run('cargo-fixture-x1', EMAIL_ID, 'session-stale-abc123', 69.5);
  db.prepare(
    `INSERT INTO matches (cargo_id, vessel_id, user_id, fit_percent, cargo_item_index)
     VALUES (?, ?, ?, ?, 0)`,
  ).run('cargo-fixture-x1', EMAIL_ID, '__demo_review__', 69.5); // sentinel — must NOT be deleted

  return db;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const fixtureMode = args.includes('--fixture');

  // Timestamp for backup (required in --apply mode, not Date.now in module scope)
  const tsIdx = args.indexOf('--ts');
  const ts = tsIdx >= 0 ? args[tsIdx + 1] : null;

  if (applyMode && !ts) {
    console.error('ERROR: --apply requires --ts <unix_seconds> for backup file naming');
    process.exit(1);
  }

  if (fixtureMode) {
    console.log('=== FIXTURE MODE — self-test against in-memory DB ===');
    const fixtureDb = buildFixtureDb();

    // Show initial state
    const located = locate(fixtureDb);
    const c1 = buildC1Plan(located.vesselRows);
    const c2Plans = buildC2Plans(fixtureDb, located.seededMatches);

    printReceipt(located, c1, c2Plans, 'DRY RUN — FIXTURE');
    verify(fixtureDb);

    // Optionally apply to fixture to prove D1/D2 pass
    console.log('\n=== APPLYING to fixture (in-memory only) to prove D-checks pass ===');
    applyChanges(fixtureDb, c1, c2Plans, located.staleSessionCount);
    verify(fixtureDb);

    // Confirm sentinel NOT deleted
    const sentinelRow = fixtureDb.prepare(
      `SELECT count(*) AS n FROM matches WHERE vessel_id=? AND user_id='__demo_review__'`,
    ).get(EMAIL_ID) as { n: number };
    console.log(`\n  Sentinel __demo_review__ preserved: ${sentinelRow.n === 1 ? '✓ PASS' : '✗ FAIL'}`);

    console.log('\n=== FIXTURE SELF-TEST COMPLETE ===');
    return;
  }

  // Normal mode — open real DB
  const dbPath = process.env.SESSIONS_DB_PATH
    ? path.resolve(process.env.SESSIONS_DB_PATH)
    : path.resolve(process.cwd(), 'data', 'demo-seed.db');

  if (!fs.existsSync(dbPath)) {
    console.error(`ERROR: DB not found at ${dbPath}`);
    console.error('Set SESSIONS_DB_PATH or ensure data/demo-seed.db exists.');
    process.exit(1);
  }

  console.log(`DB: ${dbPath}  mode: ${applyMode ? 'APPLY' : 'DRY'}`);

  if (applyMode) {
    // Backup first
    const backupPath = `${dbPath}.bak-seagull41-${ts}`;
    fs.copyFileSync(dbPath, backupPath);
    const backupSize = fs.statSync(backupPath).size;
    if (backupSize === 0) {
      console.error(`ERROR: backup at ${backupPath} has size 0 — aborting`);
      process.exit(1);
    }
    console.log(`Backup: ${backupPath}  (${backupSize} bytes)`);
  }

  const db = new Database(dbPath, { readonly: !applyMode });

  const located = locate(db);
  const c1 = buildC1Plan(located.vesselRows);
  const c2Plans = buildC2Plans(db, located.seededMatches);

  printReceipt(located, c1, c2Plans, applyMode ? 'APPLY' : 'DRY RUN');

  if (applyMode) {
    applyChanges(db, c1, c2Plans, located.staleSessionCount);
    console.log('\n✓ Changes applied inside transaction.');
    verify(db);
  }

  db.close();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
