/**
 * verify-port-da-recalibration.ts
 *
 * Part C verification: builds an in-memory SQLite DB, seeds port_da_estimates
 * from the recalibrated port-da-base.json using the REAL seedPortDa function,
 * then verifies for the SEAGULL 71 Iskenderun→Constanța scenario (DWT 8100, BULK):
 *
 *   (1) DA is now realistic (combined ≈ $24-32k, NOT the old $65.6k)
 *   (2) LIST DA == DETAIL DA (parity, delta 0) — the parity bug is fixed
 *   (3) LIST TCE == DETAIL TCE (delta 0)
 *
 * Usage:
 *   npx tsx scripts/diag/verify-port-da-recalibration.ts
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { runMigrations } from '../../lib/migrations/runner';
import { allMigrations } from '../../lib/migrations/index';
import { seedPortDa, type BaselinePort, type LlmCaller, type LlmGapBracket } from '../seed-port-da';
import { getPortDa } from '../../lib/port-da/repository';
import { sumMatchPortDaUsd } from '../../lib/port-da/match-da';
import { computeEstimatedTce, estimateFreightRate, deriveEtsCoverage, routeTransitsBosporus, quoteBosporusSafe } from '../../lib/matching/tce-calculator';
import { buildCanonicalTceInputs } from '../../lib/economics/canonical-tce-inputs';
import { calculateTCE } from '../../lib/economics/voyage-calculator';

// ─── Scenario: SEAGULL 71 ───────────────────────────────────────────────────
const VESSEL_DWT = 8100;
const CARGO_TYPE = 'BULK'; // as passed from matching layer
const LOAD_PORT = 'Iskenderun';
const DISCHARGE_PORT = 'Constanta';
const SPEED_KTS = 12;
const CONSUMPTION_MT_PER_DAY = 14;
const DISTANCE_NM = 590; // Iskenderun → Constanța via Bosporus

// Default economic parameters (same as computeEstimatedTce defaults in tce-calculator.ts)
const BUNKER_USD_MT = 600;
const EUA_EUR = 65;
const VESSEL_VALUE_USD = 22_000_000;

// No-op LLM caller (we only care about baseline brackets, not gap-fill)
const noopLlmCaller: LlmCaller = async (
  _model, _portCode, _portName, _bracketName, dwtMin, dwtMax,
): Promise<LlmGapBracket> => ({
  vessel_dwt_min: dwtMin,
  vessel_dwt_max: dwtMax,
  port_dues_usd: 20000,
  pilotage_usd: 5000,
  tugs_usd: 8000,
  stevedoring_usd_per_mt: 5.0,
  confidence: 'estimated',
});

async function main(): Promise<void> {
  // ── Build in-memory DB and seed from recalibrated JSON ─────────────────────
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);

  const baselinePath = path.join(__dirname, '..', 'seed-data', 'port-da-base.json');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as BaselinePort[];
  await seedPortDa(db, baseline, noopLlmCaller);

  const { count: daRows } = db.prepare<[], { count: number }>(
    'SELECT COUNT(*) AS count FROM port_da_estimates',
  ).get()!;
  console.log(`\nSeeded ${daRows} port_da_estimates rows from recalibrated JSON.`);

  // ── Verify individual port DA values ────────────────────────────────────────
  const iskDA = getPortDa({ portCode: 'TRISK', vesselDwt: VESSEL_DWT }, db);
  const cndDA = getPortDa({ portCode: 'ROCND', vesselDwt: VESSEL_DWT }, db);

  console.log('\n=== DA lookup for DWT ' + VESSEL_DWT + ' ===');
  console.log(`TRISK (Iskenderun): ${iskDA ? `$${iskDA.totalFixedUsd.toLocaleString()} (dues=${iskDA.portDuesUsd} pilot=${iskDA.pilotageUsd} tugs=${iskDA.tugsUsd})` : 'NULL'}`);
  console.log(`ROCND (Constanța):  ${cndDA ? `$${cndDA.totalFixedUsd.toLocaleString()} (dues=${cndDA.portDuesUsd} pilot=${cndDA.pilotageUsd} tugs=${cndDA.tugsUsd})` : 'NULL'}`);

  const combinedDA = (iskDA?.totalFixedUsd ?? 0) + (cndDA?.totalFixedUsd ?? 0);
  console.log(`\nCombined DA (both ports): $${combinedDA.toLocaleString()}`);

  // ── Check (1): DA is realistic ───────────────────────────────────────────────
  const DA_MIN = 20_000;
  const DA_MAX = 36_000;
  console.log(`\n(1) DA realistic? Range $${DA_MIN.toLocaleString()}–$${DA_MAX.toLocaleString()}:`);
  if (combinedDA >= DA_MIN && combinedDA <= DA_MAX) {
    console.log(`    PASS ✓  Combined DA $${combinedDA.toLocaleString()} is within $${DA_MIN.toLocaleString()}–$${DA_MAX.toLocaleString()}`);
    console.log(`            (OLD inflated value was ~$65,600)`);
  } else {
    console.error(`    FAIL ✗  Combined DA $${combinedDA.toLocaleString()} outside expected range!`);
    process.exit(1);
  }

  // ── Compute DA via LIST path (sumMatchPortDaUsd) ────────────────────────────
  const listDA = sumMatchPortDaUsd([LOAD_PORT, DISCHARGE_PORT], VESSEL_DWT, CARGO_TYPE, db);

  // ── Compute DA via DETAIL path (getPortDa per port, 'general' default) ──────
  const iskResolved = db.prepare<[string, number, number, string], { port_dues_usd: number; pilotage_usd: number; tugs_usd: number }>(
    'SELECT port_dues_usd, pilotage_usd, tugs_usd FROM port_da_estimates WHERE port_code = ? AND vessel_dwt_min <= ? AND vessel_dwt_max >= ? AND cargo_type = ? ORDER BY confidence DESC LIMIT 1',
  ).get('TRISK', VESSEL_DWT, VESSEL_DWT, 'general');
  const cndResolved = db.prepare<[string, number, number, string], { port_dues_usd: number; pilotage_usd: number; tugs_usd: number }>(
    'SELECT port_dues_usd, pilotage_usd, tugs_usd FROM port_da_estimates WHERE port_code = ? AND vessel_dwt_min <= ? AND vessel_dwt_max >= ? AND cargo_type = ? ORDER BY confidence DESC LIMIT 1',
  ).get('ROCND', VESSEL_DWT, VESSEL_DWT, 'general');
  const detailDA = ((iskResolved?.port_dues_usd ?? 0) + (iskResolved?.pilotage_usd ?? 0) + (iskResolved?.tugs_usd ?? 0)) +
                   ((cndResolved?.port_dues_usd ?? 0) + (cndResolved?.pilotage_usd ?? 0) + (cndResolved?.tugs_usd ?? 0));

  console.log('\n=== DA parity: LIST vs DETAIL ===');
  console.log(`LIST  DA (sumMatchPortDaUsd): $${listDA.toLocaleString()}`);
  console.log(`DETAIL DA (getPortDa/general): $${detailDA.toLocaleString()}`);
  console.log(`Delta: $${Math.abs(listDA - detailDA)}`);

  // ── Check (2): LIST DA == DETAIL DA ─────────────────────────────────────────
  console.log('\n(2) LIST DA == DETAIL DA?');
  if (listDA === detailDA) {
    console.log(`    PASS ✓  Both paths produce $${listDA.toLocaleString()} (delta 0)`);
  } else {
    console.error(`    FAIL ✗  LIST DA $${listDA.toLocaleString()} ≠ DETAIL DA $${detailDA.toLocaleString()} (delta $${Math.abs(listDA - detailDA)})`);
    process.exit(1);
  }

  // ── Compute TCE via LIST path (computeEstimatedTce / buildMatchEconomics) ───
  const freight = estimateFreightRate(CARGO_TYPE, DISTANCE_NM, VESSEL_DWT);
  const { euLegPercent, originEu, destEu } = deriveEtsCoverage(LOAD_PORT, DISCHARGE_PORT);
  const bosporusUsd = routeTransitsBosporus(LOAD_PORT, DISCHARGE_PORT)
    ? quoteBosporusSafe(VESSEL_DWT)
    : 0;

  const listTce = computeEstimatedTce(
    { rate: freight.rate, source: freight.source, confidence: freight.confidence },
    DISTANCE_NM,
    VESSEL_DWT,
    Math.min(VESSEL_DWT * 0.9, VESSEL_DWT),
    SPEED_KTS,
    CONSUMPTION_MT_PER_DAY,
    undefined,           // ballastDistanceNm
    bosporusUsd > 0 ? bosporusUsd : undefined, // canal
    listDA > 0 ? listDA : undefined,
    BUNKER_USD_MT,
    euLegPercent,
    originEu,
    destEu,
    EUA_EUR,
    true, // excludeWarRiskFromDailyTce
  );

  // ── Compute TCE via DETAIL path (calculateTCE) ───────────────────────────────
  const canonicalInputs = buildCanonicalTceInputs({
    vesselDwt: VESSEL_DWT,
    speedKts: SPEED_KTS,
    consumptionMtPerDay: CONSUMPTION_MT_PER_DAY,
    distanceNm: DISTANCE_NM,
    quantityMt: Math.min(VESSEL_DWT * 0.9, VESSEL_DWT),
    freightRateUsdPerMt: freight.rate,
    bunkerPriceUsdPerMt: BUNKER_USD_MT,
    originPort: LOAD_PORT,
    destinationPort: DISCHARGE_PORT,
    euaPriceEur: EUA_EUR,
    vesselValueUsd: VESSEL_VALUE_USD,
    canalUsd: bosporusUsd > 0 ? bosporusUsd : undefined,
    daUsd: detailDA > 0 ? detailDA : undefined,
    euLegPercent,
    originEu,
    destEu,
  });
  const detailResult = calculateTCE({ ...canonicalInputs, excludeWarRiskFromDailyTce: true });

  console.log('\n=== TCE parity: LIST vs DETAIL ===');
  console.log(`Scenario: ${LOAD_PORT} → ${DISCHARGE_PORT}, DWT=${VESSEL_DWT}, dist=${DISTANCE_NM}nm`);
  console.log(`Freight rate: $${freight.rate}/mt (${freight.source})`);
  console.log(`Canal (Bosporus): $${bosporusUsd.toLocaleString()}`);
  console.log(`LIST  DA: $${listDA.toLocaleString()}`);
  console.log(`DETAIL DA: $${detailDA.toLocaleString()}`);
  console.log(`LIST  TCE: $${listTce.tce_usd_per_day.toFixed(0)}/day`);
  console.log(`DETAIL TCE: $${detailResult.daily_tce_usd.toFixed(0)}/day`);
  console.log(`Delta: $${Math.abs(listTce.tce_usd_per_day - detailResult.daily_tce_usd).toFixed(2)}`);

  // ── Check (3): LIST TCE == DETAIL TCE ───────────────────────────────────────
  const tceDelta = Math.abs(listTce.tce_usd_per_day - detailResult.daily_tce_usd);
  console.log('\n(3) LIST TCE == DETAIL TCE (±$1)?');
  if (tceDelta <= 1) {
    console.log(`    PASS ✓  Delta $${tceDelta.toFixed(2)} ≤ $1`);
  } else {
    console.error(`    FAIL ✗  TCE delta $${tceDelta.toFixed(2)} > $1 — parity broken!`);
    process.exit(1);
  }

  console.log('\n══ ALL 3 CHECKS PASSED ══\n');
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
