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
import { enrichPortsBatch } from './lib/llm-enrich';
import { PORT_TARGETS } from './port-targets';
import type { ParsedUnlocodeRow } from './lib/unlocode-parse';
import type { SkeletonPort } from './lib/match-targets';

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
  const top10 = Array.from(byCountry.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
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

/** Top-30 broker-facing ports that need human verification before full enrich. */
const TOP30_UNLOCODES = [
  'NLRTM', 'CNSHA', 'SGSIN', 'BEANR', 'AEJEA', 'DEHAM', 'GBFXT',
  'KRPUS', 'USLAX', 'USLGB', 'HKHKG', 'BRSSZ', 'AUPHE', 'ROCND',
  'GRPIR', 'INKAN', 'INMUN', 'INJNP', 'INVTZ', 'BRSAN', 'CAVAN',
  'USNYC', 'USHOU', 'MACAS', 'EGALY', 'ESALG', 'DEBRV', 'FRLEH',
  'LTKLN', 'PLGDN',
];

async function loadSkeleton(): Promise<SkeletonPort[]> {
  const skeletonPath = path.join(DATA_DIR, 'port-master.skeleton.json');
  if (!fs.existsSync(skeletonPath)) {
    throw new Error(`Skeleton not found — run "skeleton" stage first: ${skeletonPath}`);
  }
  return JSON.parse(fs.readFileSync(skeletonPath, 'utf8')) as SkeletonPort[];
}

async function stageEnrichTop30(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const skeleton = await loadSkeleton();
  log(`Loaded ${skeleton.length} skeleton ports`);

  const top30 = skeleton.filter(p => TOP30_UNLOCODES.includes(p.unlocode));
  const rest = skeleton.filter(p => !TOP30_UNLOCODES.includes(p.unlocode));
  log(`Enriching top-30 broker-facing ports via LLM...`);

  const enriched = await enrichPortsBatch(top30);
  log(`✓ Enriched ${enriched.length} ports`);

  const draft = [...enriched, ...rest];
  const outPath = path.join(DATA_DIR, 'port-master.draft.json');
  fs.writeFileSync(outPath, JSON.stringify(draft, null, 2) + '\n');
  log(`Wrote draft: ${outPath} (${draft.length} ports total, top-${enriched.length} LLM-enriched)`);
  log(`\nNext: npx tsx scripts/verify-ports.ts --input=data/ports/port-master.draft.json --top=30`);
}

async function stageEnrichAll(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const draftPath = path.join(DATA_DIR, 'port-master.draft.json');
  const skeletonPath = path.join(DATA_DIR, 'port-master.skeleton.json');

  // Load from draft (top-30 already enriched) or fall back to skeleton
  const source = fs.existsSync(draftPath) ? draftPath : skeletonPath;
  if (!fs.existsSync(source)) {
    throw new Error(`Neither draft nor skeleton found — run "skeleton" stage first`);
  }

   
  const all = JSON.parse(fs.readFileSync(source, 'utf8')) as any[];
  // Ports that still need enrichment: no maxDraftM (i.e. still skeleton shape)
   
  const alreadyEnriched = all.filter((p: any) => typeof p.maxDraftM === 'number');
   
  const needsEnrichment = all.filter((p: any) => typeof p.maxDraftM !== 'number') as SkeletonPort[];
  log(`Already enriched: ${alreadyEnriched.length}, remaining: ${needsEnrichment.length}`);

  if (needsEnrichment.length === 0) {
    log('All ports already enriched — writing final port-master.json');
  } else {
    log(`Enriching ${needsEnrichment.length} remaining ports in batches of 10...`);
    const enriched = await enrichPortsBatch(needsEnrichment);
    log(`✓ Enriched ${enriched.length} ports`);
    alreadyEnriched.push(...enriched);
  }

  const outPath = path.join(DATA_DIR, 'port-master.json');
  fs.writeFileSync(outPath, JSON.stringify(alreadyEnriched, null, 2) + '\n');
  log(`Wrote final: ${outPath} (${alreadyEnriched.length} ports, ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  // Clean up intermediary files
  if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
  log('Removed port-master.draft.json');
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
      await stageEnrichTop30();
      break;
    case 'enrich-all':
      await stageEnrichAll();
      break;
    default:
      logErr(`Usage: npx tsx scripts/generate-port-master.ts <download|stats|skeleton|enrich-top30|enrich-all>`);
      process.exit(2);
  }
}

if (require.main === module) {
  main().catch(e => { logErr(String(e)); process.exit(1); });
}
