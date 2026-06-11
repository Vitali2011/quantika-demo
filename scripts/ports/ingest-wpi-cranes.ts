#!/usr/bin/env tsx
/**
 * WPI crane-data ingestion script.
 *
 * Reads `data/ports/wpi-crane-swl.json` (committed subset, offline-safe) and
 * merges craneSWL / craneType / craneDataAsOf into data/ports/port-master.json.
 *
 * Stages:
 *   fetch   — fetch all ports from WPI API and save to wpi-crane-swl.json
 *   apply   --dry  (default) — compute diff, print stats, write nothing
 *   apply   --write          — apply the merge (explicit flag required)
 *
 * Merge rules:
 *   - Only ADD fields to entries that lack them (never overwrite existing values).
 *   - UNLOCODE join primary; normalized name fallback.
 *   - Set craneDataAsOf to the WPI edition on every row touched.
 *   - Never touch maxDraftM, hasShoreCranes, berthType, or non-crane fields.
 *
 * Usage:
 *   npx tsx scripts/ports/ingest-wpi-cranes.ts fetch
 *   npx tsx scripts/ports/ingest-wpi-cranes.ts apply          # dry run
 *   npx tsx scripts/ports/ingest-wpi-cranes.ts apply --write  # write
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const WPI_SUBSET_PATH = path.join(REPO_ROOT, 'data', 'ports', 'wpi-crane-swl.json');
const PORT_MASTER_PATH = path.join(REPO_ROOT, 'data', 'ports', 'port-master.json');
const WPI_API_URL =
  'https://msi.nga.mil/api/publications/world-port-index?output=json';
const WPI_EDITION = 'WPI-2025';

// ─── Types ─────────────────────────────────────────────────────────────────

export type WpiYNU = 'Y' | 'N' | 'U';

export interface WpiCraneRow {
  unlocode: string;
  portName: string;
  lifts100: WpiYNU;
  lifts50: WpiYNU;
  lifts25: WpiYNU;
  lifts0: WpiYNU;
  crFixed: WpiYNU;
  crMobile: WpiYNU;
  crFloating: WpiYNU;
  cranesContainer: WpiYNU;
}

export interface PortMasterEntry {
  unlocode: string;
  name: string;
  hasShoreCranes: boolean;
  craneSWL?: number;
  craneType?: 'mobile' | 'gantry' | 'floating' | 'STS';
  terminalOperator?: string;
  craneDataAsOf?: string;
  [key: string]: unknown;
}

export interface MergeResult {
  updated: PortMasterEntry[];
  addedCount: number;
  skippedExisting: string[];
  noMatch: string[];
  dryRun: boolean;
}

// ─── Pure helper functions (unit-tested) ────────────────────────────────────

/** Convert WPI lift tiers to a numeric SWL estimate (t).
 *  Tiers are Y=yes / N=no / U=unknown. */
export function wpiTierToSWL(
  l100: WpiYNU | string,
  l50: WpiYNU | string,
  l25: WpiYNU | string,
  l0: WpiYNU | string,
): number | undefined {
  if (l100 === 'Y') return 100;
  if (l50 === 'Y') return 50;
  if (l25 === 'Y') return 25;
  if (l0 === 'Y') return 10;
  return undefined;
}

/** Resolve crane type from WPI boolean fields.
 *  Priority: STS > gantry (fixed) > floating > mobile. */
export function wpiCraneType(
  crFixed: WpiYNU | string,
  crMobile: WpiYNU | string,
  crFloating: WpiYNU | string,
  cranesContainer: WpiYNU | string,
): 'mobile' | 'gantry' | 'floating' | 'STS' | undefined {
  if (cranesContainer === 'Y') return 'STS';
  if (crFixed === 'Y') return 'gantry';
  if (crFloating === 'Y') return 'floating';
  if (crMobile === 'Y') return 'mobile';
  return undefined;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ─── Core merge function (pure, no I/O) ────────────────────────────────────

export function applyWpiCranes(
  ports: PortMasterEntry[],
  wpiRows: WpiCraneRow[],
  edition: string,
  opts: { dry?: boolean } = {},
): MergeResult {
  // Build lookup maps
  const byUnlocode = new Map<string, WpiCraneRow>();
  const byName = new Map<string, WpiCraneRow>();
  for (const row of wpiRows) {
    if (row.unlocode) byUnlocode.set(row.unlocode.toUpperCase().replace(/\s/g, ''), row);
    if (row.portName) byName.set(normalizeName(row.portName), row);
  }

  const updated: PortMasterEntry[] = [];
  const skippedExisting: string[] = [];
  const noMatch: string[] = [];
  let addedCount = 0;

  for (const port of ports) {
    // Skip if already has craneSWL
    if (port.craneSWL !== undefined) {
      skippedExisting.push(port.unlocode);
      updated.push(port);
      continue;
    }

    // Try UNLOCODE join first, then name fallback
    const code = port.unlocode.toUpperCase().replace(/\s/g, '');
    let row = byUnlocode.get(code);
    if (!row) {
      row = byName.get(normalizeName(port.name));
    }

    if (!row) {
      noMatch.push(port.unlocode);
      updated.push(port);
      continue;
    }

    const swl = wpiTierToSWL(row.lifts100, row.lifts50, row.lifts25, row.lifts0);
    const type = wpiCraneType(row.crFixed, row.crMobile, row.crFloating, row.cranesContainer);

    if (swl === undefined && type === undefined) {
      // No useful crane data
      updated.push(port);
      continue;
    }

    const enriched: PortMasterEntry = { ...port };
    if (swl !== undefined) enriched.craneSWL = swl;
    if (type !== undefined) enriched.craneType = type;
    enriched.craneDataAsOf = edition;
    updated.push(enriched);
    addedCount++;
  }

  return { updated, addedCount, skippedExisting, noMatch, dryRun: opts.dry === true };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function fetchAndSave(): Promise<void> {
  console.log(`Fetching WPI data from ${WPI_API_URL} …`);
  const resp = await fetch(WPI_API_URL);
  if (!resp.ok) throw new Error(`WPI fetch failed: ${resp.status}`);
  const json = (await resp.json()) as { ports: Record<string, WpiYNU | string>[] };
  const allPorts = json.ports ?? [];
  console.log(`Fetched ${allPorts.length} WPI ports.`);

  // Extract only crane-relevant rows for offline use
  const rows: WpiCraneRow[] = allPorts
    .filter((p) => p.unloCode || p.portName)
    .map((p) => ({
      unlocode: String(p.unloCode ?? '').replace(/\s/g, ''),
      portName: String(p.portName ?? ''),
      lifts100: (p.lifts100 ?? 'U') as WpiYNU,
      lifts50: (p.lifts50 ?? 'U') as WpiYNU,
      lifts25: (p.lifts25 ?? 'U') as WpiYNU,
      lifts0: (p.lifts0 ?? 'U') as WpiYNU,
      crFixed: (p.crFixed ?? 'U') as WpiYNU,
      crMobile: (p.crMobile ?? 'U') as WpiYNU,
      crFloating: (p.crFloating ?? 'U') as WpiYNU,
      cranesContainer: (p.cranesContainer ?? 'U') as WpiYNU,
    }));

  const out = {
    _sourceNote: 'NGA World Port Index (WPI / Pub 150). Fetched via https://msi.nga.mil/api/publications/world-port-index?output=json',
    _edition: WPI_EDITION,
    _fetchedAt: new Date().toISOString().slice(0, 10),
    ports: rows,
  };
  fs.mkdirSync(path.dirname(WPI_SUBSET_PATH), { recursive: true });
  fs.writeFileSync(WPI_SUBSET_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Saved ${rows.length} rows → ${WPI_SUBSET_PATH}`);
}

async function applyStage(write: boolean): Promise<void> {
  if (!fs.existsSync(WPI_SUBSET_PATH)) {
    console.error(`WPI subset not found at ${WPI_SUBSET_PATH}. Run: fetch first.`);
    process.exit(1);
  }
  const wpiSubset = JSON.parse(fs.readFileSync(WPI_SUBSET_PATH, 'utf8')) as {
    ports: WpiCraneRow[];
  };
  const portMaster = JSON.parse(fs.readFileSync(PORT_MASTER_PATH, 'utf8')) as PortMasterEntry[];

  const result = applyWpiCranes(portMaster, wpiSubset.ports, WPI_EDITION, { dry: !write });

  console.log(`\nWPI crane merge (${write ? '--write' : '--dry'}):`);
  console.log(`  Total ports: ${portMaster.length}`);
  console.log(`  Would add crane data: ${result.addedCount}`);
  console.log(`  Skipped (existing craneSWL): ${result.skippedExisting.length}`);
  console.log(`  No WPI match: ${result.noMatch.length}`);

  if (write) {
    fs.writeFileSync(PORT_MASTER_PATH, JSON.stringify(result.updated, null, 2) + '\n');
    console.log(`\nWrote ${PORT_MASTER_PATH}`);
  } else {
    console.log('\n[dry run] No files written. Pass --write to apply.');
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

if (require.main === module) {
  const [, , stage, flag] = process.argv;
  (async () => {
    if (stage === 'fetch') {
      await fetchAndSave();
    } else if (stage === 'apply') {
      await applyStage(flag === '--write');
    } else {
      console.log('Usage: npx tsx scripts/ports/ingest-wpi-cranes.ts <fetch|apply> [--write]');
      process.exit(1);
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
