/**
 * da-51414-root-cause.ts
 *
 * Reproduces the list↔detail TCE divergence for M/V SEAGULL 71,
 * Iskenderun → Constanța, DWT 8100, BULK.
 *
 * Run: npx tsx scripts/diag/da-51414-root-cause.ts
 *
 * IMPORTANT: local demo-seed.db has 0 rows in port_da_estimates
 * (it is built on prod via regenerate-matches.ts → seedReferenceTables).
 * This script reads from the baseline JSON directly so it can faithfully
 * reproduce the DA values the prod DB contains.
 */

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { getPortDa } from '../../lib/port-da/repository';
import { resolvePort } from '../../lib/ports/resolve';
// ── 1. Open a temporary in-memory DB and seed port_da_estimates ───────────────
// We seed directly (no LLM gap-fill) using the baseline JSON rows.
const db = new Database(':memory:');
sqliteVec.load(db);
db.exec(`
  CREATE TABLE port_da_estimates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    port_code     TEXT NOT NULL,
    port_name     TEXT NOT NULL,
    vessel_dwt_min INTEGER NOT NULL,
    vessel_dwt_max INTEGER NOT NULL,
    port_dues_usd  REAL NOT NULL,
    pilotage_usd   REAL NOT NULL,
    tugs_usd       REAL NOT NULL,
    stevedoring_usd_per_mt REAL NOT NULL DEFAULT 0,
    cargo_type     TEXT NOT NULL DEFAULT 'general',
    confidence     TEXT NOT NULL DEFAULT 'estimated',
    source         TEXT NOT NULL DEFAULT 'seed',
    updated_at     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(port_code, vessel_dwt_min, vessel_dwt_max, cargo_type)
  );
`);

type Bracket = { vessel_dwt_min: number; vessel_dwt_max: number; port_dues_usd: number; pilotage_usd: number; tugs_usd: number; stevedoring_usd_per_mt: number; cargo_type: string; confidence: string; source: string };
type PortEntry = { port_code: string; port_name: string; brackets: Bracket[] };

const baselinePath = path.resolve(__dirname, '../seed-data/port-da-base.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as PortEntry[];

const upsert = db.prepare(`
  INSERT OR REPLACE INTO port_da_estimates
    (port_code, port_name, vessel_dwt_min, vessel_dwt_max,
     port_dues_usd, pilotage_usd, tugs_usd, stevedoring_usd_per_mt,
     cargo_type, confidence, source, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertMany = db.transaction((entries: PortEntry[]) => {
  for (const port of entries) {
    for (const b of port.brackets) {
      upsert.run(port.port_code, port.port_name, b.vessel_dwt_min, b.vessel_dwt_max,
        b.port_dues_usd, b.pilotage_usd, b.tugs_usd, b.stevedoring_usd_per_mt ?? 0,
        b.cargo_type ?? 'general', b.confidence, b.source, Date.now());
    }
  }
});
insertMany(baseline);

const daCount = (db.prepare('SELECT COUNT(*) as n FROM port_da_estimates').get() as { n: number }).n;
console.log(`\n[setup] Seeded ${daCount} port_da_estimates rows into in-memory DB`);

// ── 2. Input parameters (from prod screenshot + match row) ──────────────────
const VESSEL_DWT = 8100;
const CARGO_TYPE = 'BULK';          // raw from cargo.cargoType
const LOAD_PORT_NAME = 'Iskenderun';
const DISCHARGE_PORT_NAME = 'Constanța';

console.log('\n============================================================');
console.log('SEAGULL 71 match — Iskenderun → Constanța, DWT 8100, BULK');
console.log('============================================================\n');

// ── 3. Port resolution (same logic in both paths) ────────────────────────────
const loadResolved   = resolvePort(LOAD_PORT_NAME);
const dischargeResolved = resolvePort(DISCHARGE_PORT_NAME);

console.log('Port resolution:');
console.log(`  resolvePort("${LOAD_PORT_NAME}")      → ${loadResolved ? `${loadResolved.portCode} (${loadResolved.portName})` : 'NULL'}`);
console.log(`  resolvePort("${DISCHARGE_PORT_NAME}") → ${dischargeResolved ? `${dischargeResolved.portCode} (${dischargeResolved.portName})` : 'NULL'}`);
console.log('  → Both paths (LIST and DETAIL) resolve to the SAME port codes.\n');

// ── 4. LIST path DA  (sumMatchPortDaUsd, cargoType passed as lowercase) ───────
// sumMatchPortDaUsd calls: getPortDa({ port: resolved, vesselDwt, cargoType: cargoType?.toLowerCase() }, db)
const listCargoType = CARGO_TYPE.toLowerCase(); // 'bulk'
console.log('── LIST path (sumMatchPortDaUsd) ──');
console.log(`  cargoType passed to getPortDa: "${listCargoType}"  (CARGO_TYPE.toLowerCase())`);

let listDaLoad = 0, listDaDischarge = 0;

if (loadResolved) {
  const daLoad = getPortDa({ port: loadResolved, vesselDwt: VESSEL_DWT, cargoType: listCargoType }, db);
  listDaLoad = daLoad?.totalFixedUsd ?? 0;
  console.log(`  Iskenderun (TRISK) DA: ${daLoad ? `$${daLoad.totalFixedUsd.toLocaleString()} (conf=${daLoad.confidence})` : 'null → $0'}`);
  if (!daLoad) {
    const dbRow = db.prepare("SELECT * FROM port_da_estimates WHERE port_code='TRISK' AND ? BETWEEN vessel_dwt_min AND vessel_dwt_max").all(VESSEL_DWT);
    console.log(`    DB rows for TRISK DWT=${VESSEL_DWT}: ${JSON.stringify(dbRow)}`);
    const dbRowGeneral = db.prepare("SELECT * FROM port_da_estimates WHERE port_code='TRISK' AND ? BETWEEN vessel_dwt_min AND vessel_dwt_max AND cargo_type='general'").all(VESSEL_DWT);
    console.log(`    TRISK 'general' rows at DWT ${VESSEL_DWT}: ${dbRowGeneral.length} found`);
  }
}

if (dischargeResolved) {
  const daDischarge = getPortDa({ port: dischargeResolved, vesselDwt: VESSEL_DWT, cargoType: listCargoType }, db);
  listDaDischarge = daDischarge?.totalFixedUsd ?? 0;
  console.log(`  Constanța (ROCND) DA:  ${daDischarge ? `$${daDischarge.totalFixedUsd.toLocaleString()} (conf=${daDischarge.confidence})` : 'null → $0'}`);
  if (!daDischarge) {
    const dbRowGeneral = db.prepare("SELECT * FROM port_da_estimates WHERE port_code='ROCND' AND ? BETWEEN vessel_dwt_min AND vessel_dwt_max AND cargo_type='general'").all(VESSEL_DWT);
    console.log(`    ROCND 'general' rows at DWT ${VESSEL_DWT}: ${dbRowGeneral.length} found`);
  }
}

const listTotalDa = listDaLoad + listDaDischarge;
console.log(`  LIST TOTAL DA = $${listTotalDa.toLocaleString()}\n`);

// ── 5. DETAIL path DA (resolveDaUsd, cargoType = undefined from body) ────────
// resolveDaUsd is called with body.cargoType = undefined (EconomicsTab sends no cargoType).
// getPortDa resolves: undefined && VALID_CARGO_TYPES.has(undefined) → false → 'general'
const detailCargoType = undefined; // not sent by EconomicsTab
const resolvedDetailCargoType = (detailCargoType && ['general','bulk','container','tanker'].includes(detailCargoType))
  ? detailCargoType : 'general';
console.log('── DETAIL path (resolveDaUsd in app/api/voyage/tce/route.ts) ──');
console.log(`  body.cargoType sent by EconomicsTab: undefined (not in POST body)`);
console.log(`  cargoType resolved by getPortDa:     "${resolvedDetailCargoType}"  (undefined → 'general' fallback)`);

let detailDaLoad = 0, detailDaDischarge = 0;

if (loadResolved) {
  // resolveDaUsd passes portCode directly (not port object), but getPortDa accepts both
  const daLoad = getPortDa({ portCode: loadResolved.portCode, vesselDwt: VESSEL_DWT, cargoType: detailCargoType }, db);
  detailDaLoad = daLoad?.totalFixedUsd ?? 0;
  console.log(`  Iskenderun (TRISK) DA: ${daLoad ? `$${daLoad.totalFixedUsd.toLocaleString()} (conf=${daLoad.confidence})` : 'null → $0'}`);
}

if (dischargeResolved) {
  const daDischarge = getPortDa({ portCode: dischargeResolved.portCode, vesselDwt: VESSEL_DWT, cargoType: detailCargoType }, db);
  detailDaDischarge = daDischarge?.totalFixedUsd ?? 0;
  console.log(`  Constanța (ROCND) DA:  ${daDischarge ? `$${daDischarge.totalFixedUsd.toLocaleString()} (conf=${daDischarge.confidence})` : 'null → $0'}`);
}

const detailTotalDa = detailDaLoad + detailDaDischarge;
console.log(`  DETAIL TOTAL DA = $${detailTotalDa.toLocaleString()}\n`);

// ── 6. Cross-check: what does the DB contain for these ports? ─────────────────
console.log('── port_da_estimates rows for TRISK + ROCND ──');
const allRows = db.prepare(
  "SELECT port_code, vessel_dwt_min, vessel_dwt_max, cargo_type, port_dues_usd+pilotage_usd+tugs_usd as total_fixed, confidence FROM port_da_estimates WHERE port_code IN ('TRISK','ROCND') ORDER BY port_code, vessel_dwt_min"
).all() as Array<{ port_code: string; vessel_dwt_min: number; vessel_dwt_max: number; cargo_type: string; total_fixed: number; confidence: string }>;

for (const r of allRows) {
  const inRange = VESSEL_DWT >= r.vessel_dwt_min && VESSEL_DWT <= r.vessel_dwt_max;
  console.log(`  ${r.port_code} DWT ${r.vessel_dwt_min}-${r.vessel_dwt_max} cargo_type="${r.cargo_type}" total_fixed=$${r.total_fixed.toLocaleString()} ${inRange ? '← DWT 8100 HITS THIS' : ''}`);
}

// ── 7. Summary ────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('ROOT CAUSE SUMMARY');
console.log('============================================================');
console.log(`LIST  DA = $${listTotalDa.toLocaleString()}  (sumMatchPortDaUsd, cargoType="${listCargoType}")`);
console.log(`DETAIL DA = $${detailTotalDa.toLocaleString()}  (resolveDaUsd, cargoType=undefined→"general")`);
console.log(`DIVERGENCE = $${Math.abs(detailTotalDa - listTotalDa).toLocaleString()}`);
console.log('');
console.log(`CAUSE: port_da_estimates has ONLY "general" cargo_type rows.`);
console.log(`  LIST path passes cargoType="${listCargoType}" (from cargo.cargoType.toLowerCase()).`);
console.log(`  SQL WHERE cargo_type='bulk' → 0 rows → null → DA=$0 per port.`);
console.log(`  DETAIL path sends no cargoType → getPortDa resolves undefined→"general".`);
console.log(`  SQL WHERE cargo_type='general' → hits DWT 1000-9999 rows.`);
console.log(`    TRISK: $29,200  ROCND: $36,400  TOTAL: $65,600`);
console.log('');
console.log(`FIX: In sumMatchPortDaUsd (lib/port-da/match-da.ts), normalise cargoType`);
console.log(`  to 'general' when the value is not in the valid set AND the DB has no`);
console.log(`  matching cargo_type row — OR add bulk/tanker/container rows to the`);
console.log(`  baseline JSON (preferred: mirrors real-world DA which does not vary`);
console.log(`  significantly by cargo type for fixed port dues/pilotage/tugs).`);
console.log('');
console.log(`WHICH DA IS CORRECT? $65,600 (DETAIL) — the "general" rows in the DB`);
console.log(`  are the actual port DA data. Port dues/pilotage/tugs don't significantly`);
console.log(`  differ by cargo type for a small bulker. The LIST path silently returns`);
console.log(`  $0 because it queries with cargo_type='bulk' which has no DB rows.`);
console.log(`  The LIST TCE is WRONG (DA underestimated by $65,600).`);

db.close();
