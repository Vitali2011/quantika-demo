#!/usr/bin/env tsx
/**
 * Port master generator — turns UN/LOCODE 2024-2 CSV + curated target list
 * into the production data/ports/port-master.json that lib/sailing/port-master
 * loads at runtime.
 *
 * Stages (run in order):
 *   download   — fetch UNECE ZIP into scripts/.cache/ (skip if cached)
 *   stats      — parse all CSVs, print seaport count by status / region
 *   skeleton   — produce data/ports/port-master.skeleton.json
 *                (UNLOCODE + name + country + lat/lon, NO LLM fields)
 *   enrich-top30  — LLM-enrich the top 30 broker-facing ports → draft.json
 *   enrich-all    — LLM-enrich the rest → port-master.json (final)
 *
 * Usage:
 *   npx tsx scripts/generate-port-master.ts <stage>
 *
 * Source CSVs are NOT committed (regenerable from UN/LOCODE; see .gitignore).
 * The final port-master.json IS committed and read by the production app.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseUnlocodeRow } from './lib/unlocode-parse';
import { matchTargetsToUnlocodes } from './lib/match-targets';
import { PORT_TARGETS } from './port-targets';
import type { ParsedUnlocodeRow } from './lib/unlocode-parse';

const REPO_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(REPO_ROOT, 'scripts', '.cache');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'ports');
const UNLOCODE_URL = 'https://service.unece.org/trade/locode/loc242csv.zip';

const CSV_FILES = [
  '2024-2 UNLOCODE CodeListPart1.csv',
  '2024-2 UNLOCODE CodeListPart2.csv',
  '2024-2 UNLOCODE CodeListPart3.csv',
];

function log(msg: string): void {
  process.stdout.write(msg + '\n');
}

function logErr(msg: string): void {
  process.stderr.write(msg + '\n');
}

async function downloadIfMissing(): Promise<void> {
  const zip = path.join(CACHE_DIR, 'unlocode.zip');
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  if (fs.existsSync(zip) && CSV_FILES.every(f => fs.existsSync(path.join(CACHE_DIR, f)))) {
    log(`UN/LOCODE CSVs already cached in ${CACHE_DIR}`);
    return;
  }

  log(`Downloading UN/LOCODE 2024-2 from ${UNLOCODE_URL}...`);
  // Use child_process.execSync — avoid bundler concerns at script time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execSync } = require('child_process');
  execSync(`curl -sL -o "${zip}" "${UNLOCODE_URL}"`, { stdio: 'inherit' });
  execSync(`unzip -o -q "${zip}" -d "${CACHE_DIR}"`, { stdio: 'inherit' });
  log(`Cached ${CSV_FILES.length} CSV files in ${CACHE_DIR}`);
}

function loadAllSeaports(): ParsedUnlocodeRow[] {
  const ports: ParsedUnlocodeRow[] = [];
  for (const file of CSV_FILES) {
    const fullPath = path.join(CACHE_DIR, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing cached CSV: ${fullPath} — run "download" stage first`);
    }
    // UN/LOCODE CSVs are Latin-1 (Windows-1252-ish). Reading as UTF-8 turns
    // "Belém" into "Bel\uFFFDm" (mojibake) which then fails name matching.
    const lines = fs.readFileSync(fullPath, 'latin1').split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = parseUnlocodeRow(line);
      if (parsed) ports.push(parsed);
    }
  }
  return ports;
}

async function stageDownload(): Promise<void> {
  await downloadIfMissing();
}

async function stageStats(): Promise<void> {
  await downloadIfMissing();
  const ports = loadAllSeaports();
  log(`Parsed ${ports.length} valid seaports (Function[0]==='1', status AA/AC/AF/AI/AM/AS, with coords)`);
  const byCountry = new Map<string, number>();
  for (const p of ports) byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + 1);
  log(`Coverage: ${byCountry.size} countries`);
  const top10 = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  log('Top-10 countries by seaport count:');
  for (const [c, n] of top10) log(`  ${c}: ${n}`);
}

async function stageSkeleton(): Promise<void> {
  await downloadIfMissing();
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const allRows = loadAllSeaports();
  log(`Loaded ${allRows.length} UN/LOCODE seaports`);
  log(`Matching against ${PORT_TARGETS.length} curated targets...`);

  const result = matchTargetsToUnlocodes(PORT_TARGETS, allRows);
  log(`✓ Matched: ${result.matched.length}`);
  log(`✗ Unmatched: ${result.unmatched.length}`);
  log(`! Warnings: ${result.warnings.length}`);

  if (result.warnings.length > 0) {
    log('\nWarnings:');
    for (const w of result.warnings) log(`  - ${w}`);
  }
  if (result.unmatched.length > 0) {
    log('\nUnmatched targets (target list may need explicit unlocode override):');
    for (const t of result.unmatched) log(`  - ${t.name} (${t.country})`);
  }

  const outPath = path.join(DATA_DIR, 'port-master.skeleton.json');
  fs.writeFileSync(outPath, JSON.stringify(result.matched, null, 2) + '\n');
  log(`\nWrote skeleton: ${outPath} (${result.matched.length} ports, ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
}

async function main(): Promise<void> {
  const stage = process.argv[2];
  switch (stage) {
    case 'download':
      await stageDownload();
      break;
    case 'stats':
      await stageStats();
      break;
    case 'skeleton':
      await stageSkeleton();
      break;
    case 'enrich-top30':
    case 'enrich-all':
      logErr(`Stage "${stage}" not yet implemented (Phase 4)`);
      process.exit(2);
      break;
    default:
      logErr(`Usage: npx tsx scripts/generate-port-master.ts <download|stats|skeleton|enrich-top30|enrich-all>`);
      process.exit(2);
  }
}

main().catch(e => { logErr(String(e)); process.exit(1); });
