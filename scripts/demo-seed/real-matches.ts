#!/usr/bin/env -S npx tsx
/**
 * real-matches.ts — seed demo-seed.db with REAL cargo↔vessel pairs.
 *
 * Replaces the 6 synthetic SEAGULL fixtures from patch-fit.ts with pairs
 * derived from the actual demo corpus (demo-parsed-cargoes.json + demo-parsed-vessels.json).
 *
 * Strategy:
 *   1. Apply pending migrations (040-042) to demo-seed.db.
 *   2. Load demo-parsed-cargoes.json + demo-parsed-vessels.json, rebased to today.
 *   3. Run analyzePair (deterministic, no LLM) for every pair not filtered out.
 *   4. Score each surviving pair using the same DWT+timing heuristic as build.ts.
 *   5. Compute fit_percent + fit_breakdown via computeFitBreakdown (deterministic).
 *   6. Bucket by realism partition (same logic as analyzePairs):
 *        unknown verdict → insufficientData
 *        idle + gapDays > 21 → lowConfidence
 *        matchLevel 'weak' → lowConfidence
 *        else → main matches
 *   7. Clear existing seed rows (user_id IS NULL or sentinel), insert fresh.
 *   8. Main matches: user_id = NULL (as read by hydrateDemoSession).
 *      Review bucket: user_id = '__demo_review__'.
 *      Insufficient bucket: user_id = '__demo_insufficient__'.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/real-matches.ts [--db path/to/demo-seed.db]
 *   # default: data/demo-seed.db
 */

import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { cfValue } from '@/lib/types';
import type { ParsedCargo, ParsedVessel, MatchLevel } from '@/lib/types';
import { computeFitBreakdown } from '@/lib/sailing/fit-breakdown';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { estimateFreightRate, computeEstimatedTce, parseLeadingNumber, parseConsumption } from '@/lib/matching/tce-calculator';
import { DEFAULT_BUNKER_USD_PER_MT } from '@/lib/constants';
import { IDLE_HARD_MAX_GAP_DAYS } from '@/lib/matching/pair-analyzer';
import { rebaseParsedCargoes, rebaseParsedVessels } from '@/lib/sample-data/rebase-parsed';
import rawCargoes from '@/lib/sample-data/demo-parsed-cargoes.json';
import rawVessels from '@/lib/sample-data/demo-parsed-vessels.json';

import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';
import { runHardFilters } from '@/lib/sailing/match-filters';
import { checkSanctions } from '@/lib/validation/sanctions';
import { isLaycanValid } from '@/lib/sailing/date-sanity';
import { resolvePort } from '@/lib/ports/resolve';
import { resolveVaguePort } from '@/lib/ports/resolve-vague';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a raw port string to a canonical name for getPortDistance.
 * Applies diacritic-fold + port-master lookup (resolvePort), then vague-port
 * representative (resolveVaguePort) as fallback. Returns the raw string if
 * both fail so normalizePortName in port-distances can attempt its own lookup.
 */
function resolvePortForDistance(raw: string | null): string | null {
  if (!raw) return null;
  const r = resolvePort(raw);
  if (r) return r.portName;
  const v = resolveVaguePort(raw);
  if (v) return v.portName;
  return raw;
}

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Build the seed-matches INSERT SQL with optional cargo_item_index / vessel_item_index
 * columns. Migration 044 adds these columns; older DBs without the column are tolerated
 * via the `hasIdxCol` switch (mirrors regenerate-matches.ts:220).
 *
 * Exported so the seed-INSERT contract is unit-testable without booting the full seed
 * pipeline (#791 cause B). DO NOT inline this back into the seed function — the test
 * relies on the exported shape.
 */
export function buildMatchInsertSql(hasIdxCol: boolean): string {
  return `
    INSERT INTO matches
      (cargo_id, vessel_id${hasIdxCol ? ', cargo_item_index, vessel_item_index' : ''},
       score, reason, status, user_id, created_at, updated_at,
       cargo_type, load_port, discharge_port, laycan_start, laycan_end, vessel_dwt,
       tce_usd_per_day, distance_nm, freight_rate_usd_per_mt, freight_rate_source,
       fit_percent, fit_breakdown, worksheet_json, reason_structured)
    VALUES
      (?, ?${hasIdxCol ? ', ?, ?' : ''}, ?, ?, 'shortlist', ?, ?, ?,
       ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?)
  `;
}

export function tableHasItemIndexCols(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === 'cargo_item_index');
}

/**
 * Score a surviving pair using the same heuristic as build.ts:
 *   Base 60 + timing bonus (5-25) + DWT utilisation bonus (3-15)
 * Capped at 100. No LLM dependency.
 */
function heuristicScore(
  gapDays: number | null,
  laycanStartMs: number,
  laycanEndMs: number,
  openMs: number,
  dwtSummer: number,
  cargoWeightMt: number,
): { score: number; matchLevel: MatchLevel } {
  let score = 60;

  // Timing bonus
  if (openMs >= laycanStartMs && openMs <= laycanEndMs) score += 25;
  else if (gapDays != null && gapDays >= 0 && gapDays <= 5) score += 15;
  else score += 5;

  // DWT utilisation bonus
  if (dwtSummer > 0 && cargoWeightMt > 0) {
    const util = cargoWeightMt / dwtSummer;
    if (util >= 0.50 && util <= 0.88) score += 15;
    else if (util > 0.88 && util <= 0.90) score += 10;
    else if (util < 0.50) score += 3;
  }

  score = Math.min(100, Math.max(0, score));
  const matchLevel: MatchLevel = score > 80 ? 'good' : score > 40 ? 'possible' : 'weak';
  return { score, matchLevel };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbPath = path.resolve(arg('--db') ?? 'data/demo-seed.db');
  console.log(`[real-matches] Opening ${dbPath}`);

  const db = new Database(dbPath);

  // 1. Apply pending migrations (040-042 add vessel_name/cargo_ref/fit_percent/fit_breakdown)
  console.log('[real-matches] Applying pending migrations…');
  runMigrations(db, allMigrations);

  // 2. Load demo corpus, rebased to today
  const today = new Date();
  const cargoes: ParsedCargo[] = rebaseParsedCargoes(
    rawCargoes as unknown as ParsedCargo[],
    today,
  );
  const vessels: ParsedVessel[] = rebaseParsedVessels(
    rawVessels as unknown as ParsedVessel[],
    today,
  );
  const refYear = today.getUTCFullYear();
  console.log(`[real-matches] ${cargoes.length} cargoes, ${vessels.length} vessels`);

  // 3. Evaluate all pairs deterministically
  interface SeedRow {
    cargoId: string;
    vesselId: string;
    cargoItemIndex: number;
    vesselItemIndex: number;
    score: number;
    matchLevel: MatchLevel;
    reason: string;
    cargoType: string | null;
    loadPort: string | null;
    dischargePort: string | null;
    laycanStart: number | null;
    laycanEnd: number | null;
    vesselDwt: number | null;
    tceUsdPerDay: number | null;
    distanceNm: number | null;
    freightRateUsdPerMt: number | null;
    freightRateSource: string | null;
    fitPercent: number | null;
    fitBreakdown: string | null;
    worksheetJson: string | null;
    reasonStructured: string | null;
    bucket: 'main' | 'review' | 'insufficient';
    readinessVerdict: string | null;
    gapDays: number | null;
  }

  // Deduplication key is email-level (emailId only, not itemIndex) because the
  // matches table has a UNIQUE INDEX on (cargo_id, vessel_id, COALESCE(user_id,''))
  // and cargo_id / vessel_id are stored as emailIds (same as build.ts).
  const emailPairKey = (cid: string, vid: string) => `${cid}|${vid}`;
  const bestPerPair = new Map<string, SeedRow>();

  for (const cargo of cargoes) {
    const laycan = parseLaycan(cargo.laycan, refYear);
    const loadPort = cfValue(cargo.originPort);
    const dischargePort = cfValue(cargo.destinationPort);
    const cargoWeightMt = resolveCargoWeight(cargo) ?? 0;
    const cargoType =
      typeof cargo.cargoType === 'object' && cargo.cargoType !== null && 'value' in cargo.cargoType
        ? (cargo.cargoType as unknown as { value: string }).value
        : (cargo.cargoType as string | null);

    for (const vessel of vessels) {
      const rawOpenDate = cfValue(vessel.openDate);
      const isSpot = detectSpot(rawOpenDate);
      const parsedOpen = parseVesselOpenDate(rawOpenDate, refYear, today);
      const dwtSummer = cfValue(vessel.dwtSummer) ?? 0;

      // Hard filters (structural, DWT, sanctions)
      const hf = runHardFilters({
        cargoType: cargo.cargoType,
        originPort: loadPort,
        destinationPort: dischargePort,
        weightMt:
          cargo.weightMtMin != null && cargo.weightMtMax != null &&
          cargo.weightMtMin !== cargo.weightMtMax
            ? { min: cargo.weightMtMin, max: cargo.weightMtMax }
            : resolveCargoWeight(cargo),
        cargoDescription: cfValue(cargo.cargoDescription),
        stowageFactor: cargo.stowageFactor,
        vesselType: vessel.vesselType,
        geared: vessel.geared,
        draftMax: cfValue(vessel.draftMax),
        grainCapacity: vessel.grainCapacity,
        dwtSummer: dwtSummer || null,
        dwcc: cfValue(vessel.dwcc),
        vesselRestrictions: vessel.restrictions ?? [],
        // Layer B gates (mirror lib/matching/pair-analyzer.ts)
        vesselBuilt: vessel.built ?? null,
        refYear,
        cargoMaxVesselAgeYrs: cargo.maxVesselAgeYrs ?? null,
        vesselBeam: vessel.beam ?? null,
        vesselLoa: vessel.loa ?? null,
        cargoMaxBeamM: cargo.maxBeamM ?? null,
        cargoMaxLoaM: cargo.maxLoaM ?? null,
        cargoGearRequired: cargo.gearRequired ?? null,
        vesselFlag: vessel.flag ?? null,
        vesselClassSociety: vessel.classSociety ?? null,
        cargoFlagRequired: cargo.flagRequired ?? null,
        cargoClassRequired: cargo.classRequired ?? null,
      });
      if (!hf.pass) continue;

      // Laycan structural validity
      if (laycan && !isLaycanValid(laycan).valid) continue;

      // Readiness
      const readiness = calculateReadinessGap(
        {
          openDate: rawOpenDate,
          openPosition: cfValue(vessel.openPosition),
          speedLaden: vessel.speedLaden,
          dwtSummer,
          isSpot,
        },
        { laycan: cargo.laycan, originPort: loadPort },
        { refYear, today },
      );
      if (readiness.verdict === 'late') continue;

      // Sanctions
      const sanctions = checkSanctions({
        vesselFlag: vessel.flag,
        originPort: loadPort,
        destinationPort: dischargePort,
        restrictions: vessel.restrictions ?? [],
      });
      if (sanctions.blocking) continue;

      // Score + matchLevel
      const openMs = parsedOpen ? parsedOpen.getTime() : 0;
      const laycanStartMs = laycan ? laycan.start.getTime() : 0;
      const laycanEndMs = laycan ? laycan.end.getTime() : 0;
      const { score, matchLevel } = heuristicScore(
        readiness.gapDays,
        laycanStartMs,
        laycanEndMs,
        openMs,
        dwtSummer,
        cargoWeightMt,
      );

      // Fit breakdown (deterministic, no LLM)
      const hardFilters = {
        draft: hf.checks.draft,
        crane: hf.checks.crane,
        volume: hf.checks.volume,
        cargoVessel: hf.checks.cargoVessel,
        destDraft: hf.checks.destDraft,
        destCrane: hf.checks.destCrane,
        cargoWeight: hf.checks.cargoWeight,
      };
      // Economics — computed before fit breakdown so the economic cap (C3 #783) can demote
      // loss-making voyages. Resolve ports via diacritic-fold + resolveVaguePort so diacritic
      // names (Constanța, Aliağa) and vague descriptors yield a real sea distance.
      const resolvedLoad = resolvePortForDistance(loadPort);
      const resolvedDischarge = resolvePortForDistance(dischargePort);
      const distanceResult =
        resolvedLoad && resolvedDischarge
          ? getPortDistance(resolvedLoad, resolvedDischarge)
          : null;
      let tceUsdPerDay: number | null = null;
      let distanceNm: number | null = null;
      let freightRateUsdPerMt: number | null = null;
      let freightRateSource: string | null = null;
      if (distanceResult && distanceResult.nm > 0) {
        const quantityMt = resolveCargoWeight(cargo) ?? 0;
        const speedKts = parseLeadingNumber(vessel.speedLaden);
        const consumptionMt = parseConsumption(vessel.consumption);
        const freightEst = estimateFreightRate(cargoType, distanceResult.nm, dwtSummer);
        // TODO: wire live bunker price (NLRTM VLSFO) when DB row is available in seed context.
        const tceEst = computeEstimatedTce(
          freightEst, distanceResult.nm, dwtSummer, quantityMt, speedKts, consumptionMt,
          undefined, undefined, undefined, DEFAULT_BUNKER_USD_PER_MT,
        );
        tceUsdPerDay = tceEst.tce_usd_per_day;
        freightRateUsdPerMt = tceEst.freight_rate_usd_per_mt;
        freightRateSource = tceEst.freight_rate_source;
        distanceNm = distanceResult.nm;
      }

      // refYear MUST be passed: without it computeFitBreakdown treats vessel age as
      // unknown → the EU-discharge 25yr+ cap (#2) and vetting age factor never fire.
      const fb = computeFitBreakdown({
        cargo, vessel, readiness, sanctions, hardFilters, refYear,
        tceUsdPerDay: tceUsdPerDay ?? undefined,
      });

      // Bucket assignment (mirrors pair-analyzer realism partition)
      let bucket: 'main' | 'review' | 'insufficient';
      if (readiness.verdict === 'unknown') {
        bucket = 'insufficient';
      } else if (
        readiness.verdict === 'idle' &&
        readiness.gapDays != null &&
        readiness.gapDays > IDLE_HARD_MAX_GAP_DAYS
      ) {
        bucket = 'review';
      } else if (matchLevel === 'weak') {
        bucket = 'review';
      } else {
        bucket = 'main';
      }

      const reason = readiness.explanation ?? `Score ${score}, ${matchLevel}`;

      const row: SeedRow = {
        cargoId: cargo.emailId,
        vesselId: vessel.emailId,
        cargoItemIndex: cargo.itemIndex ?? 0,
        vesselItemIndex: vessel.itemIndex ?? 0,
        score,
        matchLevel,
        reason,
        cargoType,
        loadPort,
        dischargePort,
        laycanStart: laycanStartMs || null,
        laycanEnd: laycanEndMs || null,
        vesselDwt: dwtSummer || null,
        tceUsdPerDay,
        distanceNm,
        freightRateUsdPerMt,
        freightRateSource,
        fitPercent: fb.fitPercent,
        fitBreakdown: JSON.stringify(fb),
        // reason_structured drives the main-board score-breakdown expander
        // (MatchesClient.tsx). Same per-factor breakdown as fit_breakdown.
        reasonStructured: JSON.stringify(fb),
        // worksheet_json drives the cargo↔vessel comparison table (MatchWorksheet.tsx).
        // Mirror lib/types.ts MatchWorksheet shape; without it the detail table is blank.
        worksheetJson: JSON.stringify({
          readiness: { ...readiness, openPosition: cfValue(vessel.openPosition) },
          vessel: {
            draftMax: cfValue(vessel.draftMax),
            grainCapacity: vessel.grainCapacity,
            grainCapacityUnit: vessel.grainCapacityUnit,
            geared: vessel.geared,
            vesselType: vessel.vesselType,
            flag: vessel.flag,
            built: vessel.built,
            pandi: vessel.pandi,
            classSociety: vessel.classSociety,
            lastCargoes: vessel.lastCargoes,
            dwtSummer: cfValue(vessel.dwtSummer),
            dwcc: cfValue(vessel.dwcc),
          },
          cargo: { weightMt: cfValue(cargo.weightMt), weightMtEffective: resolveCargoWeight(cargo) ?? null, cargoType, loadPort, dischargePort },
          hardFilters: { draft: hf.checks.draft, crane: hf.checks.crane, volume: hf.checks.volume },
        }),
        bucket,
        readinessVerdict: readiness.verdict,
        gapDays: readiness.gapDays,
      };

      // Keep best score per cargo email↔vessel email pair (email-level, not item-level)
      const key = emailPairKey(cargo.emailId, vessel.emailId);
      const existing = bestPerPair.get(key);
      if (!existing || score > existing.score) {
        bestPerPair.set(key, row);
      }
    }
  }

  // Cap main matches: top 6 per cargo by score (mirrors build.ts fan-out cap)
  const mainByCargoScore = new Map<string, SeedRow[]>();
  const reviewRows: SeedRow[] = [];
  const insufficientRows: SeedRow[] = [];

  for (const row of bestPerPair.values()) {
    if (row.bucket === 'main') {
      const arr = mainByCargoScore.get(row.cargoId) ?? [];
      arr.push(row);
      mainByCargoScore.set(row.cargoId, arr);
    } else if (row.bucket === 'review') {
      reviewRows.push(row);
    } else {
      insufficientRows.push(row);
    }
  }

  const mainRows: SeedRow[] = [];
  for (const arr of mainByCargoScore.values()) {
    arr.sort((a, b) => b.score - a.score);
    mainRows.push(...arr.slice(0, 6));
  }
  mainRows.sort((a, b) => b.score - a.score);

  console.log(
    `[real-matches] Buckets: main=${mainRows.length}, review=${reviewRows.length}, insufficient=${insufficientRows.length}`,
  );

  // 4. Clear old seed data (NULL + sentinel user_ids), insert fresh
  const nowMs = Date.now();
  db.prepare(
    `DELETE FROM matches WHERE user_id IS NULL OR user_id = '__demo_review__' OR user_id = '__demo_insufficient__'`,
  ).run();

  const hasIdxCol = tableHasItemIndexCols(db);
  const insert = db.prepare(buildMatchInsertSql(hasIdxCol));

  const insertMany = db.transaction((seedRows: SeedRow[], userId: string | null) => {
    for (const r of seedRows) {
      insert.run(
        r.cargoId, r.vesselId,
        ...(hasIdxCol ? [r.cargoItemIndex, r.vesselItemIndex] : []),
        r.score, r.reason, userId, nowMs, nowMs,
        r.cargoType, r.loadPort, r.dischargePort, r.laycanStart, r.laycanEnd, r.vesselDwt,
        r.tceUsdPerDay, r.distanceNm, r.freightRateUsdPerMt, r.freightRateSource,
        r.fitPercent, r.fitBreakdown, r.worksheetJson, r.reasonStructured,
      );
    }
  });

  insertMany(mainRows, null);
  insertMany(reviewRows, '__demo_review__');
  insertMany(insufficientRows, '__demo_insufficient__');

  console.log('[real-matches] Inserted:');
  console.log(`  Main (user_id=NULL):             ${mainRows.length}`);
  console.log(`  Review (user_id=__demo_review__): ${reviewRows.length}`);
  console.log(`  Insufficient (user_id=__demo_insufficient__): ${insufficientRows.length}`);

  // 5. Verify
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) as main_count,
         SUM(CASE WHEN user_id = '__demo_review__' THEN 1 ELSE 0 END) as review_count,
         SUM(CASE WHEN user_id = '__demo_insufficient__' THEN 1 ELSE 0 END) as insufficient_count
       FROM matches`,
    )
    .get() as { main_count: number; review_count: number; insufficient_count: number };

  console.log('[real-matches] DB verification:', counts);

  const fitCheck = db
    .prepare(`SELECT count(*) as n FROM matches WHERE user_id IS NULL AND fit_percent IS NOT NULL`)
    .get() as { n: number };
  console.log(`[real-matches] Main rows with fit_percent: ${fitCheck.n}`);

  if (counts.main_count === 0) {
    console.warn('[real-matches] WARNING: 0 main matches — demo cargoes may all have expired laycans or bad data');
  }
  if (counts.review_count === 0) {
    console.warn('[real-matches] NOTE: 0 review matches — all pairs scored ≥weak or have known verdict');
  }
  if (counts.insufficient_count === 0) {
    console.warn('[real-matches] NOTE: 0 insufficient matches — all pairs have parseable dates/ports');
  }

  db.close();
  console.log('[real-matches] Done.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[real-matches] FATAL:', err);
    process.exit(1);
  });
}
