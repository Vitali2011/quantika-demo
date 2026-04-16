#!/usr/bin/env tsx
/**
 * Port verification script — prints a markdown table of top-N ports for
 * manual review before committing the LLM-enriched port master.
 *
 * Usage:
 *   npx tsx scripts/verify-ports.ts --input=data/ports/port-master.draft.json --top=30
 *   npx tsx scripts/verify-ports.ts --input=data/ports/port-master.json --random=20
 */

import * as fs from 'fs';
import * as path from 'path';

interface PortRecord {
  unlocode: string;
  name: string;
  country: string;
  lat: number | null;
  lon: number | null;
  maxDraftM?: number;
  hasShoreCranes?: boolean;
  berthType?: string;
  maxLOA?: number | null;
  cargoBerthTypes?: string[];
  tidal?: boolean;
  icePort?: boolean;
  dataConfidence?: string;
  sourceNote?: string;
}

const TOP30_UNLOCODES = [
  'NLRTM', 'CNSHA', 'SGSIN', 'BEANR', 'AEJEA', 'DEHAM', 'GBFXT',
  'KRPUS', 'USLAX', 'USLGB', 'HKHKG', 'BRSSZ', 'AUPHE', 'ROCND',
  'GRPIR', 'INKAN', 'INMUN', 'INJNP', 'INVTZ', 'BRSAN', 'CAVAN',
  'USNYC', 'USHOU', 'MACAS', 'EGALY', 'ESALG', 'DEBRV', 'FRLEH',
  'LTKLN', 'PLGDN',
];

function parseArgs(): { input: string; top?: number; random?: number } {
  const args = process.argv.slice(2);
  const get = (prefix: string): string | undefined =>
    args.find(a => a.startsWith(prefix))?.slice(prefix.length);

  const input = get('--input=') ?? 'data/ports/port-master.draft.json';
  const topStr = get('--top=');
  const randomStr = get('--random=');
  return {
    input,
    top: topStr ? parseInt(topStr, 10) : undefined,
    random: randomStr ? parseInt(randomStr, 10) : undefined,
  };
}

function cell(v: unknown, width = 0): string {
  const s = v == null ? '—' : String(v);
  return width ? s.padEnd(width) : s;
}

function formatDraft(p: PortRecord): string {
  return p.maxDraftM != null ? `${p.maxDraftM}m` : '—';
}

function formatCranes(p: PortRecord): string {
  if (p.hasShoreCranes == null) return '—';
  return p.hasShoreCranes ? '✓' : '✗';
}

function formatConfidence(p: PortRecord): string {
  const c = p.dataConfidence;
  if (!c) return '—';
  if (c === 'high') return '●high';
  if (c === 'medium') return '◑mid';
  return '○low';
}

function formatLOA(p: PortRecord): string {
  return p.maxLOA != null ? `${p.maxLOA}m` : '—';
}

function formatCoords(p: PortRecord): string {
  if (p.lat == null || p.lon == null) return '—';
  const lat = p.lat >= 0 ? `${p.lat.toFixed(2)}N` : `${Math.abs(p.lat).toFixed(2)}S`;
  const lon = p.lon >= 0 ? `${p.lon.toFixed(2)}E` : `${Math.abs(p.lon).toFixed(2)}W`;
  return `${lat} ${lon}`;
}

function printTable(ports: PortRecord[]): void {
  // Header
  const headers = ['Name', 'CC', 'UNLOCODE', 'Draft', 'Cranes', 'Berth', 'LOA', 'Conf', 'Coords', 'Source'];
  const sep = headers.map(h => '-'.repeat(Math.max(h.length, 8)));

  const rows = ports.map(p => [
    p.name,
    p.country,
    p.unlocode,
    formatDraft(p),
    formatCranes(p),
    p.berthType ?? '—',
    formatLOA(p),
    formatConfidence(p),
    formatCoords(p),
    (p.sourceNote ?? '—').slice(0, 40),
  ]);

  // Compute column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i].length), sep[i].length),
  );

  const fmt = (row: string[]) => '| ' + row.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';

  console.log(fmt(headers));
  console.log('|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|');
  for (const row of rows) {
    console.log(fmt(row));
  }
}

function main(): void {
  const { input, top, random } = parseArgs();
  const inputPath = path.resolve(process.cwd(), input);

  if (!fs.existsSync(inputPath)) {
    process.stderr.write(`File not found: ${inputPath}\nRun "enrich-top30" stage first.\n`);
    process.exit(1);
  }

  const all: PortRecord[] = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  let selected: PortRecord[];

  if (top != null) {
    // Show top-N by the priority order of TOP30_UNLOCODES, then others
    const byUnlocode = new Map(all.map(p => [p.unlocode, p]));
    const ordered = TOP30_UNLOCODES.map(u => byUnlocode.get(u)).filter((p): p is PortRecord => p != null);
    // Fill remaining if top > ordered.length
    if (top > ordered.length) {
      const seen = new Set(ordered.map(p => p.unlocode));
      for (const p of all) {
        if (!seen.has(p.unlocode)) ordered.push(p);
        if (ordered.length >= top) break;
      }
    }
    selected = ordered.slice(0, top);
  } else if (random != null) {
    // Random sample
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    selected = shuffled.slice(0, random);
  } else {
    selected = all.slice(0, 30);
  }

  const enrichedCount = selected.filter(p => p.maxDraftM != null).length;
  const lowConfCount = selected.filter(p => p.dataConfidence === 'low').length;

  console.log(`\n## Port Master Verification — ${selected.length} ports`);
  console.log(`Source: ${input} (${all.length} total ports)`);
  console.log(`Enriched in selection: ${enrichedCount}/${selected.length}, low-confidence: ${lowConfCount}\n`);

  printTable(selected);

  const totalLow = all.filter(p => p.dataConfidence === 'low').length;
  const totalEnriched = all.filter(p => p.maxDraftM != null).length;
  console.log(`\n**Summary:** ${all.length} ports total, ${totalEnriched} enriched, ${totalLow} low-confidence.`);
}

main();
