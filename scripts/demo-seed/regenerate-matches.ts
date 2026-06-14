#!/usr/bin/env -S npx tsx
/**
 * regenerate-matches.ts — rebuild the demo seed matches through the REAL
 * production matching engine (analyzePairs), so the broker sees only matches
 * that pass EVERY rule (draft, cranes, volume, weight/DWCC, cargo↔vessel type,
 * IMSBC, laycan structure, timing, sanctions, hold cleanliness).
 *
 * Background — why the old seed was wrong
 * ---------------------------------------
 * scripts/demo-seed/build.ts paired cargo×vessel with a naive 90%-utilisation +
 * ±7-day laycan heuristic, BYPASSING the real engine. It also stored the parsed
 * data in shapes the engine can't read: cargo.laycan as a {start,end} OBJECT
 * (canonical ParsedCargo.laycan is `string`), and vessel.openDate as a bare ISO
 * STRING (canonical is ConfidenceField<string> — cfValue() yields null). With
 * those shapes the engine classifies every pair as "unknown timing" → 0 broker
 * matches. This script (a) normalises the parsed_results shapes to the canonical
 * contract — which ALSO fixes the live render (persistSessionMatches.parseLaycan)
 * — and (b) regenerates matches via analyzePairs.
 *
 * Output buckets → seed user_ids (read by buildDemoSessionBlob):
 *   mainMatches (clean)              → user_id NULL            (main list)
 *   lowConfidenceMatches             → '__demo_review__'       (review tab)
 *   insufficientData                 → '__demo_insufficient__' (insufficient tab)
 * Hold-cleanliness blockSend matches are DROPPED from the main list (rule violated).
 * Each bucket is deduped to one match per (cargo email, vessel email) pair — the
 * unique index is (cargo_id, vessel_id, user_id) and the detail page resolves a
 * match by those email ids — keeping the highest-fit item combination, and the
 * winning item indices are stored in cargo_item_index / vessel_item_index.
 *
 *   npx tsx scripts/demo-seed/regenerate-matches.ts [--db data/demo-seed.db] [--dry]
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'node:path';
import fs from 'node:fs';
import { analyzePairs } from '@/lib/matching/pair-analyzer';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';
import { cfValue, type ParsedCargo, type ParsedVessel, type Match, type MatchWorksheet } from '@/lib/types';
import { normalizeVesselCapacityToCbm } from '@/lib/parsing/vessel-capacity-units';
import { seedCharterersWithDb } from '../knowledge/seeds/seed-charterers';
import { seedPscHistoryWithDb } from '../knowledge/seeds/seed-psc-history';
import { seedPortDa, type BaselinePort } from '../seed-port-da';
import { lookupCii } from '@/lib/imo/cii-lookup';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { deriveBucketReason } from '@/lib/matching/bucket-reason';
import { breakevenTceByDwt } from '@/lib/economics/breakeven-thresholds';

// ── CII hydration helper ──────────────────────────────────────────────────────

/** Hydrate vessel.ciiRating from the static cii.json dataset by IMO (offline,
 *  no LLM). 'unknown'/no-IMO → leave null (neutral). Never overwrites an
 *  existing rating. Mutates the vessels in place. */
export async function hydrateCiiRatings(vessels: ParsedVessel[]): Promise<void> {
  for (const vessel of vessels) {
    if (vessel.ciiRating != null) continue;
    const imo = vessel.imo;
    if (!imo) continue;
    const { rating } = await lookupCii(imo, { callLlm: async () => 'unknown' });
    vessel.ciiRating = rating === 'unknown' ? null : rating;
  }
}

// ── Lane #1: invalidate stale demo sessions after regen ──────────────────────

/**
 * After a regen replaces the master/sentinel buckets, the pre-regen per-session
 * copies + their session blobs are stale. Wipe both so the next login re-hydrates
 * from the fresh NULL bucket (buildDemoSessionBlob reads only `WHERE user_id IS NULL`).
 * deleteOrphanSessionMatches can't help — demo sessions have a ~30-day TTL, so they're
 * never "orphans" during the regen window.
 *
 * Founder decision: invalidate ALL sessions. demo-seed.db (== SESSIONS_DB_PATH in
 * DEMO_MODE) holds only demo sessions; no real/non-demo sessions live here.
 */
export function invalidateLiveSessions(db: Database.Database): void {
  const matchDel = db
    .prepare(
      `DELETE FROM matches WHERE user_id IS NOT NULL
         AND user_id NOT IN ('__demo_review__','__demo_insufficient__')`,
    )
    .run();
  const sessionDel = db.prepare(`DELETE FROM sessions`).run();
  console.log(
    `[regen] invalidated stale demo state · cleared ${matchDel.changes} session match copies · expired ${sessionDel.changes} sessions`,
  );
}

// ── Phase 1: seed reference tables into the regen's own db handle ────────────

/**
 * Populate charterers, psc_detention_history, and port_da_estimates from
 * committed offline sources into the SAME db handle that regenerate-matches
 * already has open. Guarantees rows land in demo-seed.db, not sessions.db.
 *
 * Idempotent — safe to call on each regen run (each underlying seeder is
 * already idempotent: charterers ON CONFLICT UPDATE, psc DELETE+reinsert,
 * port_da INSERT OR REPLACE).
 *
 * NOTE: port_da gap-fill via LLM is SKIPPED here (no llmCaller passed) —
 * the noopLlmCaller never calls the real API, so the seeding is deterministic
 * and works offline. Only the baseline JSON rows are inserted.
 */
export async function seedReferenceTables(db: Database.Database): Promise<void> {
  // 1. Charterers
  seedCharterersWithDb(db);

  // 2. PSC detention history
  seedPscHistoryWithDb(db);

  // 3. Port DA estimates — baseline only (no LLM gap-fill in regen context)
  const baselinePath = path.resolve(__dirname, '../seed-data/port-da-base.json');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as BaselinePort[];
  // Pass a no-op LLM caller so the function never makes real API calls.
  const noopLlmCaller = async (): Promise<never> => { throw new Error('noop'); };
  await seedPortDa(db, baseline, noopLlmCaller);

  const chartCount = (db.prepare('SELECT COUNT(*) as n FROM charterers').get() as { n: number }).n;
  const pscCount = (db.prepare('SELECT COUNT(*) as n FROM psc_detention_history').get() as { n: number }).n;
  const daCount = (db.prepare('SELECT COUNT(*) as n FROM port_da_estimates').get() as { n: number }).n;
  console.log(`[regen] reference tables seeded — charterers=${chartCount} psc=${pscCount} port_da=${daCount}`);
}

// ── Phase 2: seed RAG virtual tables into the regen's own db handle ──────────

const RAG_VEC_TABLES = ['imsbc_vec', 'igc_vec', 'jwc_vec', 'bimco_vec'] as const;
const RAG_FTS_TABLES = ['imsbc_fts', 'igc_fts', 'jwc_fts', 'bimco_fts'] as const;

/**
 * Populate the 8 RAG virtual tables (4 × vec0 + 4 × FTS5) from the committed
 * offline reference artifact `data/knowledge/knowledge-ref.db` into the SAME
 * db handle that regenerate-matches already has open. Guarantees rows land in
 * demo-seed.db, not sessions.db.
 *
 * Idempotent: if a table already has rows (COUNT(*) > 0) it is skipped, so a
 * re-run never duplicates. Tables that are empty in the reference (e.g., bimco
 * when no embeddings have been ingested yet) are copied as empty — no error.
 *
 * MUST call sqliteVec.load(db) on the target handle before any vec0 access.
 * The function does that internally so callers don't need to.
 *
 * @param db    - Target database handle (already open, writable).
 * @param opts  - { dry?: boolean } — when dry=true the function returns without
 *               writing (mirrors the --dry flag in main()).
 */
export async function seedRagTables(
  db: Database.Database,
  opts: { dry?: boolean } = {},
): Promise<void> {
  if (opts.dry) return;

  // Load sqlite-vec extension on this handle (safe to call multiple times — idempotent).
  sqliteVec.load(db);

  const refDbPath = path.resolve(__dirname, '../../data/knowledge/knowledge-ref.db');
  if (!fs.existsSync(refDbPath)) {
    throw new Error(`[regen] knowledge-ref.db not found at ${refDbPath}. Cannot seed RAG tables.`);
  }

  // ATTACH the reference db read-only.
  db.exec(`ATTACH DATABASE '${refDbPath}' AS src`);

  try {
    const counts: Record<string, number> = {};

    // Copy vec0 tables via the virtual-table interface.
    for (const table of RAG_VEC_TABLES) {
      const { n } = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      if (n > 0) {
        counts[table] = n;
        continue; // already seeded — idempotent skip
      }
      const { n: srcN } = db.prepare(`SELECT COUNT(*) as n FROM src.${table}`).get() as { n: number };
      if (srcN > 0) {
        db.exec(
          `INSERT INTO ${table}(embedding, content, metadata) SELECT embedding, content, metadata FROM src.${table}`,
        );
      }
      const { n: destN } = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      counts[table] = destN;
    }

    // Copy FTS5 tables via the virtual-table interface.
    for (const table of RAG_FTS_TABLES) {
      const { n } = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      if (n > 0) {
        counts[table] = n;
        continue; // already seeded — idempotent skip
      }
      const { n: srcN } = db.prepare(`SELECT COUNT(*) as n FROM src.${table}`).get() as { n: number };
      if (srcN > 0) {
        db.exec(
          `INSERT INTO ${table}(content, metadata) SELECT content, metadata FROM src.${table}`,
        );
      }
      const { n: destN } = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      counts[table] = destN;
    }

    console.log(
      `[regen] RAG tables seeded — ` +
        [...RAG_VEC_TABLES, ...RAG_FTS_TABLES].map((t) => `${t}=${counts[t] ?? 0}`).join(' '),
    );
  } finally {
    db.exec(`DETACH DATABASE src`);
  }
}

// ── --rebuild-worksheet exports ───────────────────────────────────────────────

export interface RebuildRow {
  matchId: number;
  cargoId: string;
  vesselId: string;
  oldLaycanStart: string | null;
  newLaycanStart: string | null;
}

export interface RebuildWorksheetSummary {
  planned: number;
  written: number;
  rows: RebuildRow[];
}

/**
 * For every seed match whose worksheet_json.readiness.laycanStart disagrees
 * with the current parsed_results laycan, recompute readiness and update
 * worksheet_json in-place. Does NOT touch laycan_start, distance_nm,
 * fit_percent, or any other column.
 *
 * opts.dry=true → report planned rewrites, write nothing (for --dry-rebuild-worksheet).
 */
export async function rebuildWorksheets(
  db: Database.Database,
  opts: { dry?: boolean } = {},
): Promise<RebuildWorksheetSummary> {
  const { dry = false } = opts;

  const frozen =
    (db.prepare(`SELECT frozen_date f FROM demo_seed_meta WHERE id=1`).get() as { f?: string })?.f ??
    '2026-05-28';
  const today = new Date(frozen + 'T00:00:00.000Z');
  const refYear = today.getUTCFullYear();

  // Load all parsed_results into item-level maps
  const cargoByKey = new Map<string, ParsedCargo>(); // key = emailId|itemIndex
  const vesselByKey = new Map<string, ParsedVessel>();

  for (const r of db
    .prepare(
      `SELECT gmail_message_id id, parse_type, result_json j FROM parsed_results WHERE parse_type IN ('cargo','vessel')`,
    )
    .all() as Array<{ id: string; parse_type: string; j: string }>) {
    const raw = JSON.parse(r.j);
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];
    items.forEach((it, idx) => {
      it.emailId = r.id;
      it.itemIndex = idx;
      if (r.parse_type === 'cargo') {
        const nl = normalizeLaycan(it.laycan);
        if (nl !== it.laycan) it.laycan = nl;
        cargoByKey.set(`${r.id}|${idx}`, it as unknown as ParsedCargo);
      } else {
        vesselByKey.set(`${r.id}|${idx}`, it as unknown as ParsedVessel);
      }
    });
  }

  // Check schema
  const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
  const hasWorksheetCol = cols.some((c) => c.name === 'worksheet_json');
  const hasIdxCol = cols.some((c) => c.name === 'cargo_item_index');

  if (!hasWorksheetCol) return { planned: 0, written: 0, rows: [] };

  const selectSql = `
    SELECT id, cargo_id, vessel_id,
           ${hasIdxCol ? 'cargo_item_index, vessel_item_index,' : '0 AS cargo_item_index, 0 AS vessel_item_index,'}
           laycan_start, distance_nm, fit_percent, worksheet_json
    FROM matches
    WHERE (user_id IS NULL OR user_id IN ('__demo_review__','__demo_insufficient__'))
      AND worksheet_json IS NOT NULL
  `;

  const seedMatches = db.prepare(selectSql).all() as Array<{
    id: number;
    cargo_id: string;
    vessel_id: string;
    cargo_item_index: number;
    vessel_item_index: number;
    laycan_start: number | null;
    distance_nm: number | null;
    fit_percent: number | null;
    worksheet_json: string;
  }>;

  const summary: RebuildWorksheetSummary = { planned: 0, written: 0, rows: [] };
  const updateStmt = dry
    ? null
    : db.prepare(`UPDATE matches SET worksheet_json = ? WHERE id = ?`);

  for (const row of seedMatches) {
    let existingWs: MatchWorksheet | null = null;
    try {
      existingWs = JSON.parse(row.worksheet_json);
    } catch {
      continue;
    }
    if (!existingWs) continue;

    const cargo = cargoByKey.get(`${row.cargo_id}|${row.cargo_item_index}`);
    const vessel = vesselByKey.get(`${row.vessel_id}|${row.vessel_item_index}`);

    if (!cargo) continue;

    const normalizedLaycan = normalizeLaycan(cargo.laycan);
    const vesselOpenDate = vessel ? cfValue(vessel.openDate) : null;

    const freshReadiness = calculateReadinessGap(
      {
        openDate: vesselOpenDate,
        openPosition: vessel ? cfValue(vessel.openPosition) : null,
        speedLaden: vessel?.speedLaden ?? null,
        dwtSummer: vessel ? (cfValue(vessel.dwtSummer) ?? null) : null,
        isSpot: detectSpot(vesselOpenDate),
      },
      { laycan: normalizedLaycan, originPort: cfValue(cargo.originPort) },
      { refYear, today },
    );

    const oldLaycanStart = existingWs.readiness?.laycanStart ?? null;
    const newLaycanStart = freshReadiness.laycanStart;

    // Detect cross-item cargo contamination: wrong item's port/weight baked into worksheet
    const actualDischargePort = cfValue(cargo.destinationPort) ?? null;
    const actualWeightMt = cfValue(cargo.weightMt) ?? null;
    const cargoMismatch =
      actualDischargePort !== (existingWs.cargo?.dischargePort ?? null) ||
      actualWeightMt !== (existingWs.cargo?.weightMt ?? null);

    if (oldLaycanStart === newLaycanStart && !cargoMismatch) continue;

    const rebuiltWs: MatchWorksheet = {
      ...existingWs,
      readiness: {
        openDate: freshReadiness.openDate,
        laycanStart: freshReadiness.laycanStart,
        laycanEnd: freshReadiness.laycanEnd,
        distanceNm: freshReadiness.distanceNm,
        distanceExact: freshReadiness.distanceExact,
        speedKn: freshReadiness.speedKn,
        sailingDays: freshReadiness.sailingDays,
        arrivalDate: freshReadiness.arrivalDate,
        gapDays: freshReadiness.gapDays,
        verdict: freshReadiness.verdict,
        explanation: freshReadiness.explanation,
        openPosition: vessel ? (cfValue(vessel.openPosition) ?? null) : null,
      },
      cargo: {
        weightMt: cfValue(cargo.weightMt) ?? null,
        weightMtEffective: resolveCargoWeight(cargo) ?? null,
        cargoType: cargoTypeStr(cargo),
        loadPort: cfValue(cargo.originPort) ?? null,
        dischargePort: cfValue(cargo.destinationPort) ?? null,
      },
    };

    const rebuildRow: RebuildRow = {
      matchId: row.id,
      cargoId: row.cargo_id,
      vesselId: row.vessel_id,
      oldLaycanStart,
      newLaycanStart,
    };
    summary.rows.push(rebuildRow);
    summary.planned++;
    console.log(
      `[regen] planned REWRITE match ${row.id}: laycan ${oldLaycanStart} → ${newLaycanStart}${cargoMismatch ? ' + cargo' : ''}${dry ? ' (dry)' : ''}`,
    );

    if (!dry) {
      updateStmt!.run(JSON.stringify(rebuiltWs), row.id);
      summary.written++;
    }
  }

  return summary;
}

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}
const DRY = process.argv.includes('--dry');

/** Demo laycan is stored as {start,end} ISO object; parseLaycan needs a string. */
function normalizeLaycan(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw || null;
  if (typeof raw === 'object') {
    const o = raw as { start?: string; end?: string };
    const s = o.start ? String(o.start).slice(0, 10) : null;
    const e = o.end ? String(o.end).slice(0, 10) : null;
    if (s && e) return `${s} to ${e}`;
    if (s) return s;
  }
  return null;
}

type CF = { value: string; confidence: string; sourceText: string };
/** Demo openDate is a bare ISO string; canonical is ConfidenceField<string>. */
function wrapOpenDate(raw: unknown): CF | unknown {
  if (typeof raw === 'string' && raw) return { value: raw, confidence: 'confirmed', sourceText: raw };
  return raw;
}

function cargoTypeStr(cargo: ParsedCargo): string | null {
  const t = cargo.cargoType as unknown;
  if (t && typeof t === 'object' && 'value' in (t as object)) return (t as { value: string }).value;
  return (t as string) ?? null;
}

// ── Quarantine list ───────────────────────────────────────────────────────────
// Matches in this list are moved to the review bucket regardless of fit score.
// Thin post-ETS matches that would show implausibly low ($100-300/day) TCE to
// a client, signalling a broken calc rather than honest economics.
export const QUARANTINE_PAIRS: Array<{ loadPort: string; dischargePort: string; vesselDwtMin: number; vesselDwtMax: number }> = [
  // Thisvi(GR)→Monfalcone(IT) 18930 DWT: post-ETS TCE ~$277/day — thin to the point of
  // looking broken. Smaller-DWT variants (8100-9220 DWT) are viable and remain in main.
  { loadPort: 'Thisvi', dischargePort: 'Monfalcone', vesselDwtMin: 17000, vesselDwtMax: 21000 },
];

export function isMatchQuarantined(m: { loadPort: string | null; dischargePort: string | null; vesselDwt: number | null }): boolean {
  return QUARANTINE_PAIRS.some(
    (q) =>
      m.loadPort?.toLowerCase() === q.loadPort.toLowerCase() &&
      m.dischargePort?.toLowerCase() === q.dischargePort.toLowerCase() &&
      (m.vesselDwt ?? 0) >= q.vesselDwtMin &&
      (m.vesselDwt ?? 0) <= q.vesselDwtMax,
  );
}

function matchToQuarantineInput(m: Match) {
  return {
    loadPort: m.worksheet?.cargo.loadPort ?? null,
    dischargePort: m.worksheet?.cargo.dischargePort ?? null,
    vesselDwt: m.worksheet?.vessel.dwtSummer ?? null,
  };
}

/** Build the worksheet object for a regen match, carrying the full filter passport.
 *  Mirrors the live path in persist-session-matches.ts: full hardFilters (all gates),
 *  sanctions, and bucketReason derived at persist-time. */
export function buildWorksheet(m: Match, cargo: ParsedCargo | undefined, vessel: ParsedVessel | undefined): MatchWorksheet | null {
  if (!m.readiness) return null;
  const vesselDwt = vessel ? (cfValue(vessel.dwtSummer) ?? null) : null;
  const bucketReason = deriveBucketReason({
    verdict: m.readiness.verdict ?? 'unknown',
    gapDays: m.readiness.gapDays ?? null,
    matchLevel: m.matchLevel,
    tceUsdPerDay: m.economics?.tceUsdPerDay ?? null,
    vesselDwt,
    issues: m.issues ?? [],
  });
  return {
    readiness: {
      ...m.readiness,
      openPosition: vessel ? (cfValue(vessel.openPosition) ?? null) : null,
    },
    vessel: {
      draftMax: vessel ? (cfValue(vessel.draftMax) ?? null) : null,
      grainCapacity: vessel?.grainCapacity ?? null,
      grainCapacityUnit: vessel?.grainCapacityUnit ?? null,
      geared: vessel?.geared ?? null,
      vesselType: vessel?.vesselType ?? null,
      flag: vessel?.flag ?? null,
      built: vessel?.built ?? null,
      pandi: vessel?.pandi ?? null,
      classSociety: vessel?.classSociety ?? null,
      lastCargoes: vessel?.lastCargoes ?? null,
      dwtSummer: vesselDwt,
      dwcc: vessel ? (cfValue(vessel.dwcc) ?? null) : null,
    },
    cargo: {
      weightMt: cargo ? (cfValue(cargo.weightMt) ?? null) : null,
      cargoType: cargo ? cargoTypeStr(cargo) : null,
      loadPort: cargo ? (cfValue(cargo.originPort) ?? null) : null,
      dischargePort: cargo ? (cfValue(cargo.destinationPort) ?? null) : null,
    },
    hardFilters: m.hardFilters ?? {
      draft: { pass: true },
      crane: { pass: true },
      volume: { pass: true },
      cargoVessel: { pass: true },
      destDraft: { pass: true },
      destCrane: { pass: true },
      cargoWeight: { pass: true },
    },
    sanctions: m.sanctions,
    bucketReason,
  };
}

async function main() {
  // --rebuild-worksheet / --dry-rebuild-worksheet: targeted worksheet rebuild mode.
  // Does NOT re-run analyzePairs — only patches worksheet_json for seed matches
  // whose readiness.laycanStart disagrees with the current parsed_results laycan.
  const REBUILD_WORKSHEET =
    process.argv.includes('--rebuild-worksheet') ||
    process.argv.includes('--dry-rebuild-worksheet');
  if (REBUILD_WORKSHEET) {
    const isDry =
      process.argv.includes('--dry-rebuild-worksheet') ||
      (process.argv.includes('--rebuild-worksheet') && process.argv.includes('--dry'));
    const dbPath = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');
    console.log(`[regen] rebuild-worksheet mode — ${dbPath}${isDry ? ' (DRY)' : ''}`);
    const db = new Database(dbPath, isDry ? { readonly: true } : {});
    if (!isDry) db.pragma('journal_mode = WAL');
    const result = await rebuildWorksheets(db, { dry: isDry });
    console.log(
      `[regen] rebuild-worksheet done: planned=${result.planned} written=${result.written}`,
    );
    if (isDry) console.log('[regen] DRY — no writes.');
    db.close();
    return;
  }

  const dbPath = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');
  console.log(`[regen] Opening ${dbPath}${DRY ? ' (DRY — no writes)' : ''}`);
  const db = new Database(dbPath, DRY ? { readonly: true } : {});
  if (!DRY) db.pragma('journal_mode = WAL');

  // ── Step 0: seed reference tables (charterers, psc, port_da) into THIS db ──
  if (!DRY) {
    await seedReferenceTables(db);
    await seedRagTables(db);
  }

  const frozen = (db.prepare(`SELECT frozen_date f FROM demo_seed_meta WHERE id=1`).get() as { f?: string })?.f ?? '2026-05-28';
  const today = new Date(frozen + 'T00:00:00.000Z');
  const refYear = today.getUTCFullYear();
  const nowMs = today.getTime();

  // ── 1. Load + normalise parsed_results to the canonical engine contract ──
  const cargos: ParsedCargo[] = [];
  const vessels: ParsedVessel[] = [];
  const updateParsed = db.prepare(`UPDATE parsed_results SET result_json = ? WHERE gmail_message_id = ? AND parse_type = ?`);
  let normalizedRows = 0;

  for (const r of db.prepare(
    `SELECT gmail_message_id id, parse_type, result_json j FROM parsed_results WHERE parse_type IN ('cargo','vessel')`,
  ).all() as Array<{ id: string; parse_type: string; j: string }>) {
    const raw = JSON.parse(r.j);
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];
    let changed = false;
    items.forEach((it, idx) => {
      it.emailId = r.id;
      it.itemIndex = idx;
      if (r.parse_type === 'cargo') {
        const nl = normalizeLaycan(it.laycan);
        if (nl !== it.laycan) { it.laycan = nl; changed = true; }
        cargos.push(it as unknown as ParsedCargo);
      } else {
        const wrapped = wrapOpenDate(it.openDate);
        if (wrapped !== it.openDate) { it.openDate = wrapped; changed = true; }
        vessels.push(it as unknown as ParsedVessel);
      }
    });
    if (changed && !DRY) { updateParsed.run(JSON.stringify(items), r.id, r.parse_type); normalizedRows++; }
  }
  console.log(`[regen] frozen=${frozen} refYear=${refYear} · cargos=${cargos.length} vessels=${vessels.length} · normalized parsed rows=${normalizedRows}`);

  // CBFT→CBM at ENGINE INTAKE (#984 follow-up): seeded parsed_results store the
  // RAW cbft value + grainCapacityUnit='cbft'. analyzePairs' volume readers
  // (checkVolume/scoreVolume) read grainCapacity as m³, so without this the
  // engine scored the 8 cbft vessels with ~35x inflated volume capacity and the
  // volume gate never bound. Same single-owner util as parse-time + hydrate, so
  // all three readers agree. In-memory only — the raw cbft stays in parsed_results
  // (read-time conversion is the contract, mirroring #984); this normalises the
  // in-memory vessels used for BOTH analyzePairs AND the downstream worksheet.
  const cbftVesselCount = vessels.filter(
    (v) => v.grainCapacityUnit && String(v.grainCapacityUnit).toLowerCase() === 'cbft',
  ).length;
  for (const v of vessels) normalizeVesselCapacityToCbm(v);
  console.log(`[regen] cbft→cbm engine-intake conversion applied to ${cbftVesselCount} vessel(s)`);

  await hydrateCiiRatings(vessels);
  console.log(`[regen] CII hydrated for ${vessels.filter((v) => v.ciiRating != null).length}/${vessels.length} vessels`);

  // ── 2. Run the real engine (no LLM — deterministic gates + sweep + fit) ──
  const bunkerRow = getLatestBunkerPrice(db, 'NLRTM', 'VLSFO');
  const bunkerPriceUsdPerMt = bunkerRow?.price_usd_per_mt ?? 600;
  console.log(`[regen] bunker price: ${bunkerPriceUsdPerMt} USD/mt (${bunkerRow ? 'live' : 'fallback'})`);
  const result = await analyzePairs(cargos, vessels, async () => [], { refYear, today, db, bunkerPriceUsdPerMt });

  // ── 3. Dedup each bucket: one match per ITEM pair, then collapse cross-email
  //        content dupes — keeping the highest fit (then score). Drop cleanliness
  //        blockSend from main.
  const cargoMap = new Map(cargos.map((c) => [`${c.emailId}|${c.itemIndex}`, c]));
  const vesselMap = new Map(vessels.map((v) => [`${v.emailId}|${v.itemIndex}`, v]));

  // Dedup by CONTENT identity, not email id: the demo corpus re-circulates the
  // same vessel/cargo across several emails (different gmail-id, same content),
  // which produced visually identical matches. Key = vessel name + cargo
  // description + load port + laycan start. Discharge port is deliberately
  // EXCLUDED — its free-text wording varies ("Greece (port unspecified)" vs
  // "Greece port (unspecified)") and would split true dupes. Laycan start IS in
  // the key, so genuinely different parcels (same cargo, different dates) stay.
  function contentKey(m: Match): string {
    const v = vesselMap.get(`${m.vesselEmailId}|${m.vesselItemIndex}`);
    const c = cargoMap.get(`${m.cargoEmailId}|${m.cargoItemIndex}`);
    const vn = (v ? cfValue(v.vesselName) : null) ?? m.vesselEmailId;
    const desc = (c ? cfValue(c.cargoDescription) : null) ?? m.cargoEmailId;
    const op = (c ? cfValue(c.originPort) : null) ?? '';
    const lay = c ? parseLaycan(c.laycan, refYear) : null;
    const ls = lay ? lay.start.getTime() : 0;
    return `${vn}|${desc}|${op}|${ls}`;
  }
  function bestBy(matches: Match[], keyFn: (m: Match) => string): Match[] {
    const best = new Map<string, Match>();
    for (const m of matches) {
      const key = keyFn(m);
      const prev = best.get(key);
      const f = m.fitPercent ?? -1, pf = prev?.fitPercent ?? -1;
      if (!prev || f > pf || (f === pf && m.score > prev.score)) best.set(key, m);
    }
    return [...best.values()];
  }
  // Pass 1: one match per ITEM pair — the engine already emits unique item
  // pairs (pair-analyzer dedupes by pairKey), this guards against accidental
  // dupes only. Since migration 051 the unique index is item-aware, so two
  // items of the same email legitimately produce two board rows (audit C.5,
  // founder 2026-06-12 — replaces the old one-per-email-pair collapse).
  // Pass 2: collapse cross-email content dupes (re-circulated vessel/cargo).
  // Survivors may share (cargo_id, vessel_id) with distinct item indices —
  // INSERT OR IGNORE is safe under idx_matches_unique_pair_item.
  function dedup(matches: Match[]): Match[] {
    return bestBy(
      bestBy(matches, (m) => `${m.cargoEmailId}|${m.cargoItemIndex}|${m.vesselEmailId}|${m.vesselItemIndex}`),
      contentKey,
    );
  }

  // Broker-facing one-line note: tier headline + the weakest 1-2 factors, so the
  // broker sees AT A GLANCE what is missing on a non-perfect match (stored in
  // `reason`, shown on the row + detail). The full per-factor breakdown is the
  // expandable fit panel; this is the summary.
  function gapNote(m: Match): string {
    const fb = m.fitBreakdown;
    const fit = Math.round(m.fitPercent ?? 0);
    if (!fb) return m.matchReasons[0] ?? '';
    const verdict = fb.inputs?.verdict;
    if (verdict === 'unknown') return 'Timing unconfirmed — vague port/date; verify before calling';
    const util = fb.inputs?.utilisation, dist = fb.inputs?.distanceNm, gap = fb.inputs?.gapDays;
    const short = (factor: string): string => {
      switch (factor) {
        case 'utilisation': return util != null ? `under-utilised ${Math.round(util * 100)}%` : 'low utilisation';
        case 'timing': return verdict === 'idle' ? `vessel idle ~${Math.abs(Math.round(gap ?? 0))}d pre-laycan` : verdict === 'tight' ? 'tight laycan timing' : 'timing risk';
        case 'ballast': return dist != null ? `long ballast ~${Math.round(dist)}nm` : 'long ballast leg';
        case 'vetting': return 'vetting unconfirmed';
        case 'cranes': return 'crane availability unverified';
        case 'classFit': return 'vessel size mismatch';
        case 'volume': return 'hold volume tight';
        case 'draft': return 'draft unverified';
        case 'cargoType': return 'cargo-type fit marginal';
        default: return factor;
      }
    };
    const weak = (fb.components ?? [])
      .filter((c) => c.weight >= 4 && c.score / c.weight < 0.72)
      .sort((a, b) => a.score / a.weight - b.score / b.weight)
      .slice(0, 2)
      .map((c) => short(c.factor));
    const cap = fb.appliedCap ? ` (capped: ${fb.appliedCap.reason})` : '';
    if (fit >= 80 && weak.length === 0) return 'Strong fit — clean across factors';
    const head = fit >= 80 ? 'Strong fit' : fit >= 70 ? 'Good fit' : 'Workable';
    return weak.length ? `${head} — watch: ${weak.join(', ')}${cap}` : `${head}${cap}`;
  }

  // Main board = fit >= floor (broker audit); the weaker sub-floor tail (mostly
  // deadfreight) is demoted to the review tab rather than hidden. Insufficient
  // (timing unknown — vague port/date) is capped to a representative sample.
  const MAIN_FIT_FLOOR = Number(arg('--fit-floor') ?? 60);
  const INSUF_CAP = Number(arg('--insuf-cap') ?? 60);
  const mainAll = dedup(result.matches.filter((m) => m.confidence?.blockSend !== true));
  const mainClean = mainAll.filter((m) => (m.fitPercent ?? 0) >= MAIN_FIT_FLOOR && !isMatchQuarantined(matchToQuarantineInput(m)));
  const demoted = mainAll.filter((m) => (m.fitPercent ?? 0) < MAIN_FIT_FLOOR || isMatchQuarantined(matchToQuarantineInput(m)));
  const review = dedup([...result.lowConfidenceMatches, ...demoted]);
  const insufficient = dedup(result.insufficientData)
    .sort((a, b) => b.score - a.score)
    .slice(0, INSUF_CAP);

  const fits = (arr: Match[]) => arr.map((m) => m.fitPercent ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
  const fm = fits(mainClean);
  console.log(`[regen] BUCKETS (deduped per item-pair + content · main floor fit>=${MAIN_FIT_FLOOR}):`);
  console.log(`  main (NULL):            ${mainClean.length}  · fit min ${fm[0]?.toFixed(0)} med ${fm[Math.floor(fm.length/2)]?.toFixed(0)} max ${fm[fm.length-1]?.toFixed(0)} · ≥80:${fm.filter(x=>x>=80).length} ≥70:${fm.filter(x=>x>=70).length}`);
  console.log(`  review (__demo_review__):       ${review.length}  (engine-low ${dedup(result.lowConfidenceMatches).length} + demoted sub-floor ${demoted.length})`);
  console.log(`  insufficient (__demo_insufficient__): ${insufficient.length}`);
  console.log(`  (cleanliness-blocked are engine-demoted to review since audit C.4; blockSend safety-net dropped from main: ${result.matches.filter((m) => m.confidence?.blockSend === true).length}; engine blocked total: ${result.blockedMatches.length})`);

  if (DRY) { db.close(); console.log('[regen] DRY — no writes.'); return; }

  // ── 4. Write: replace the seed buckets (NULL + sentinels). Orphan per-session
  //        UUID copies are left for the app's deleteOrphanSessionMatches to prune. ──
  const _matchesCols = (db.prepare(`PRAGMA table_info(matches)`).all() as Array<{name:string}>);
  const hasWorksheetCol = _matchesCols.some((c) => c.name === 'worksheet_json');
  const hasBreakevenCol = _matchesCols.some((c) => c.name === 'breakeven_tce_usd_per_day');

  const insert = db.prepare(`
    INSERT OR IGNORE INTO matches
      (cargo_id, vessel_id, cargo_item_index, vessel_item_index, score, reason, status, user_id,
       created_at, updated_at, reason_structured, cargo_type, load_port, discharge_port,
       laycan_start, laycan_end, vessel_dwt, tce_usd_per_day, distance_nm, vessel_name, cargo_ref,
       fit_percent, fit_breakdown,
       freight_rate_usd_per_mt, freight_rate_source${hasWorksheetCol ? ', worksheet_json' : ''}${hasBreakevenCol ? ', breakeven_tce_usd_per_day' : ''})
    VALUES (?, ?, ?, ?, ?, ?, 'shortlist', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${hasWorksheetCol ? ', ?' : ''}${hasBreakevenCol ? ', ?' : ''})
  `);

  function writeBucket(matches: Match[], userId: string | null): number {
    let n = 0;
    for (const m of matches) {
      const cargo = cargoMap.get(`${m.cargoEmailId}|${m.cargoItemIndex}`);
      const vessel = vesselMap.get(`${m.vesselEmailId}|${m.vesselItemIndex}`);
      const loadPort = cargo ? cfValue(cargo.originPort) : null;
      const dischargePort = cargo ? cfValue(cargo.destinationPort) : null;
      const lay = cargo ? parseLaycan(cargo.laycan, refYear) : null;
      const voyage = loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;
      const vesselDwt = vessel ? (cfValue(vessel.dwtSummer) ?? null) : null;
      const ws = buildWorksheet(m, cargo, vessel);
      const args: Array<string | number | null> = [
        m.cargoEmailId, m.vesselEmailId, m.cargoItemIndex, m.vesselItemIndex,
        Math.max(0, Math.min(100, Math.round(m.score))), gapNote(m), userId,
        nowMs, nowMs,
        m.scoreBreakdown ? JSON.stringify(m.scoreBreakdown) : null,
        cargo ? cargoTypeStr(cargo) : null,
        loadPort, dischargePort,
        lay ? lay.start.getTime() : null,
        lay ? lay.end.getTime() : null,
        vesselDwt,
        // #819 Phase B(b): stored tce_usd_per_day MUST come from the live
        // voyage-calculator path (buildMatchEconomics via pair-analyzer) so the
        // seed bucket and persistSessionMatches recompute agree numerically.
        // pair-analyzer feeds resolveFreightRate (Tier-2 now uses round-trip
        // days) into buildMatchEconomics → m.economics.tceUsdPerDay is the
        // canonical one-truth value. Do NOT substitute a pre-computed or cached
        // estimate here — it will diverge from persist's recompute.
        m.economics?.tceUsdPerDay ?? null,
        voyage ? voyage.nm : null,
        vessel ? (cfValue(vessel.vesselName) || null) : null,
        cargo ? (cfValue(cargo.cargoDescription) || null) : null,
        m.fitPercent ?? null,
        m.fitBreakdown ? JSON.stringify(m.fitBreakdown) : null,
        m.economics?.freightRateUsdPerMt ?? null,
        m.economics?.freightRateSource ?? null,
      ];
      if (hasWorksheetCol) args.push(ws ? JSON.stringify(ws) : null);
      if (hasBreakevenCol) args.push(vesselDwt ? breakevenTceByDwt(vesselDwt) : null);
      insert.run(...args);
      n++;
    }
    return n;
  }

  const tx = db.transaction(() => {
    const del = db.prepare(`DELETE FROM matches WHERE user_id IS NULL OR user_id IN ('__demo_review__','__demo_insufficient__')`).run();
    const a = writeBucket(mainClean, null);
    const b = writeBucket(review, '__demo_review__');
    const c = writeBucket(insufficient, '__demo_insufficient__');
    console.log(`[regen] deleted ${del.changes} old seed rows · wrote main=${a} review=${b} insufficient=${c}`);
  });
  tx();

  // Lane #1: wipe stale per-session copies + session blobs so the next login
  // re-hydrates from the fresh master bucket just written above.
  invalidateLiveSessions(db);

  // verify
  const v = db.prepare(`SELECT COUNT(*) n, SUM(fit_percent IS NOT NULL) withfit FROM matches WHERE user_id IS NULL`).get() as { n: number; withfit: number };
  console.log(`[regen] verify main(NULL): ${v.n} rows, ${v.withfit} with fit`);
  db.close();
}
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
