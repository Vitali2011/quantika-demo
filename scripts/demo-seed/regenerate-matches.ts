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
import path from 'node:path';
import { analyzePairs } from '@/lib/matching/pair-analyzer';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';
import { cfValue, type ParsedCargo, type ParsedVessel, type Match, type MatchWorksheet } from '@/lib/types';

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

  // ── 2. Run the real engine (no LLM — deterministic gates + sweep + fit) ──
  const result = await analyzePairs(cargos, vessels, async () => [], { refYear, today, db });

  // ── 3. Dedup each bucket to one match per (cargo email, vessel email) pair,
  //        keeping the highest fit (then score). Drop cleanliness blockSend from main.
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
  // Pass 1: one match per (cargo email, vessel email) — REQUIRED by the unique
  // index (cargo_id, vessel_id, user_id); picks the best item combo per pair.
  // Pass 2: collapse cross-email content dupes (re-circulated vessel/cargo).
  // Order matters: after pass 1 every survivor has a distinct email pair, so
  // pass 2 never leaves two rows sharing (cargo_id, vessel_id) → no INSERT clash.
  function dedup(matches: Match[]): Match[] {
    return bestBy(bestBy(matches, (m) => `${m.cargoEmailId}|${m.vesselEmailId}`), contentKey);
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
  const mainClean = mainAll.filter((m) => (m.fitPercent ?? 0) >= MAIN_FIT_FLOOR);
  const demoted = mainAll.filter((m) => (m.fitPercent ?? 0) < MAIN_FIT_FLOOR);
  const review = dedup([...result.lowConfidenceMatches, ...demoted]);
  const insufficient = dedup(result.insufficientData)
    .sort((a, b) => b.score - a.score)
    .slice(0, INSUF_CAP);

  const fits = (arr: Match[]) => arr.map((m) => m.fitPercent ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
  const fm = fits(mainClean);
  console.log(`[regen] BUCKETS (deduped to email-pair · main floor fit>=${MAIN_FIT_FLOOR}):`);
  console.log(`  main (NULL):            ${mainClean.length}  · fit min ${fm[0]?.toFixed(0)} med ${fm[Math.floor(fm.length/2)]?.toFixed(0)} max ${fm[fm.length-1]?.toFixed(0)} · ≥80:${fm.filter(x=>x>=80).length} ≥70:${fm.filter(x=>x>=70).length}`);
  console.log(`  review (__demo_review__):       ${review.length}  (engine-low ${dedup(result.lowConfidenceMatches).length} + demoted sub-floor ${demoted.length})`);
  console.log(`  insufficient (__demo_insufficient__): ${insufficient.length}`);
  console.log(`  (dropped main cleanliness-blocked: ${result.matches.filter((m) => m.confidence?.blockSend === true).length}; engine blocked total: ${result.blockedMatches.length})`);

  if (DRY) { db.close(); console.log('[regen] DRY — no writes.'); return; }

  // ── 4. Write: replace the seed buckets (NULL + sentinels). Orphan per-session
  //        UUID copies are left for the app's deleteOrphanSessionMatches to prune. ──
  const hasWorksheetCol = (db.prepare(`PRAGMA table_info(matches)`).all() as Array<{name:string}>)
    .some((c) => c.name === 'worksheet_json');

  const insert = db.prepare(`
    INSERT OR IGNORE INTO matches
      (cargo_id, vessel_id, cargo_item_index, vessel_item_index, score, reason, status, user_id,
       created_at, updated_at, reason_structured, cargo_type, load_port, discharge_port,
       laycan_start, laycan_end, vessel_dwt, tce_usd_per_day, distance_nm, vessel_name, cargo_ref,
       fit_percent, fit_breakdown${hasWorksheetCol ? ', worksheet_json' : ''})
    VALUES (?, ?, ?, ?, ?, ?, 'shortlist', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${hasWorksheetCol ? ', ?' : ''})
  `);

  function buildWorksheet(m: Match, cargo: ParsedCargo | undefined, vessel: ParsedVessel | undefined): MatchWorksheet | null {
    if (!m.readiness) return null;
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
        dwtSummer: vessel ? (cfValue(vessel.dwtSummer) ?? null) : null,
        dwcc: vessel ? (cfValue(vessel.dwcc) ?? null) : null,
      },
      cargo: {
        weightMt: cargo ? (cfValue(cargo.weightMt) ?? null) : null,
        cargoType: cargo ? cargoTypeStr(cargo) : null,
        loadPort: cargo ? (cfValue(cargo.originPort) ?? null) : null,
        dischargePort: cargo ? (cfValue(cargo.destinationPort) ?? null) : null,
      },
      hardFilters: {
        draft: m.hardFilters?.draft ?? { pass: true },
        crane: m.hardFilters?.crane ?? { pass: true },
        volume: m.hardFilters?.volume ?? { pass: true },
      },
    };
  }

  function writeBucket(matches: Match[], userId: string | null): number {
    let n = 0;
    for (const m of matches) {
      const cargo = cargoMap.get(`${m.cargoEmailId}|${m.cargoItemIndex}`);
      const vessel = vesselMap.get(`${m.vesselEmailId}|${m.vesselItemIndex}`);
      const loadPort = cargo ? cfValue(cargo.originPort) : null;
      const dischargePort = cargo ? cfValue(cargo.destinationPort) : null;
      const lay = cargo ? parseLaycan(cargo.laycan, refYear) : null;
      const voyage = loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;
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
        vessel ? (cfValue(vessel.dwtSummer) ?? null) : null,
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
      ];
      if (hasWorksheetCol) args.push(ws ? JSON.stringify(ws) : null);
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

  // verify
  const v = db.prepare(`SELECT COUNT(*) n, SUM(fit_percent IS NOT NULL) withfit FROM matches WHERE user_id IS NULL`).get() as { n: number; withfit: number };
  console.log(`[regen] verify main(NULL): ${v.n} rows, ${v.withfit} with fit`);
  db.close();
}
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
