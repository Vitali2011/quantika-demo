/**
 * scripts/demo-seed/equasis-parse-saved.ts
 *
 * Parse raw Equasis ShipInfo HTML saved during a live authenticated fetch and
 * emit the provenance-bearing enrichment record. Separated from the Playwright
 * fetcher so parsing is reproducible offline from the saved HTML (cookie-expiry
 * resilient): the live fetch saves each page, this turns them into structured
 * data with `source: 'equasis'`.
 *
 *   RAW_DIR=/tmp/equasis-raw npx tsx scripts/demo-seed/equasis-parse-saved.ts
 *
 * Output: lib/sample-data/equasis-enrichment.json (NOT seed data — review/patch
 * into demo-parsed-vessels.json via equasis-backfill.ts).
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseShipInfo, detectAuthFailure, type EquasisFields } from './equasis-fetch';

const RAW_DIR = process.env.RAW_DIR ?? '/tmp/equasis-raw';
const OUT = path.join(process.cwd(), 'lib/sample-data/equasis-enrichment.json');

function main(): void {
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.html'))
    .sort();
  const results: EquasisFields[] = [];
  for (const f of files) {
    const imo = f.replace(/\.html$/, '');
    const html = fs.readFileSync(path.join(RAW_DIR, f), 'utf8');
    if (detectAuthFailure(html)) {
      console.error(`AUTH FAILURE in ${f} — skipping (re-fetch with a fresh cookie).`);
      continue;
    }
    const fields = parseShipInfo(html, imo);
    results.push(fields);
    console.log(
      `${imo}  flag=${fields.flag}  built=${fields.yearBuilt}  class=${fields.classSociety}  pandi=${fields.pandi}`,
    );
  }
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n');
  console.log(`\nWrote ${results.length} records → ${OUT}`);
}

if (require.main === module) main();
