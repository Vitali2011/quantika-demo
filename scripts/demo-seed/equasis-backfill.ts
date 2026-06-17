/**
 * scripts/demo-seed/equasis-backfill.ts
 *
 * Patch lib/sample-data/demo-parsed-vessels.json with REAL Equasis values from
 * the enrichment sidecar (lib/sample-data/equasis-enrichment.json, source:
 * 'equasis'). Fills gaps and corrects wrong flag / built / classSociety / P&I —
 * ONLY for fields Equasis actually returned (non-null).
 *
 * Light normalisation maps Equasis's raw spelling to the demo's canonical form
 * so vessel-vetting resolves (Paris MoU flag keys, IACS alias keys):
 *   - flag: strip register suffix ("(MAR)", "(Republic of)"), fix "St." spacing,
 *           expand the St Vincent long form.
 *   - classSociety: strip the trailing recognised-org parenthetical
 *           (" (IACS)", " (IS)") — the alias table keys on the bare society name.
 * The sidecar retains the verbatim Equasis values for audit/provenance.
 *
 *   npx tsx scripts/demo-seed/equasis-backfill.ts          # write
 *   DRY_RUN=1 npx tsx scripts/demo-seed/equasis-backfill.ts # preview only
 *   OUT=/tmp/seed-copy.json npx tsx scripts/demo-seed/equasis-backfill.ts # value-check copy
 */
import * as fs from 'fs';
import * as path from 'path';
import type { EquasisFields } from './equasis-fetch';

const SEED = path.join(process.cwd(), 'lib/sample-data/demo-parsed-vessels.json');
const SIDECAR = path.join(process.cwd(), 'lib/sample-data/equasis-enrichment.json');

const FLAG_CANON: Record<string, string> = {
  'St.Kitts and Nevis': 'St Kitts and Nevis',
  'Palau (Republic of)': 'Palau',
  'Portugal (MAR)': 'Portugal',
  'St Vincent and Grenadines': 'Saint Vincent and the Grenadines',
};

export function canonFlag(flag: string | null): string | null {
  if (!flag) return null;
  return FLAG_CANON[flag] ?? flag;
}

export function canonClass(cls: string | null): string | null {
  if (!cls) return null;
  // Strip a trailing recognised-org parenthetical: "Nippon Kaiji Kyokai (IACS)" → "Nippon Kaiji Kyokai".
  return cls.replace(/\s*\((?:IACS|IS)\)\s*$/i, '').trim() || null;
}

interface SeedVessel {
  imo: string | null;
  vesselName?: { value?: string };
  flag: string | null;
  built: number | null;
  classSociety: string | null;
  pandi: string | null;
  [k: string]: unknown;
}

function main(): void {
  const seed: SeedVessel[] = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const sidecar: EquasisFields[] = JSON.parse(fs.readFileSync(SIDECAR, 'utf8'));
  const byImo = new Map(sidecar.map((r) => [r.imo, r]));

  let filled = 0;
  let corrected = 0;
  const log: string[] = [];

  for (const v of seed) {
    if (!v.imo) continue;
    const e = byImo.get(v.imo);
    if (!e) continue;

    const patch: Array<[keyof SeedVessel, unknown]> = [
      ['flag', canonFlag(e.flag)],
      ['built', e.yearBuilt],
      ['classSociety', canonClass(e.classSociety)],
      ['pandi', e.pandi],
    ];
    for (const [field, next] of patch) {
      if (next == null) continue; // only fields Equasis returned
      const prev = v[field];
      if (prev == null) {
        v[field] = next;
        filled++;
        log.push(`  ${v.imo} ${String(field)}: (null) → ${String(next)}`);
      } else if (String(prev) !== String(next)) {
        v[field] = next;
        corrected++;
        log.push(`  ${v.imo} ${String(field)}: ${String(prev)} → ${String(next)} [corrected]`);
      }
    }
  }

  console.log(log.join('\n'));
  console.log(`\nfilled=${filled} corrected=${corrected}`);

  if (process.env.DRY_RUN) {
    console.log('DRY_RUN — no write.');
    return;
  }
  const out = process.env.OUT ?? SEED;
  fs.writeFileSync(out, JSON.stringify(seed, null, 2) + '\n');
  console.log(`Wrote → ${out}`);
}

// Run only when executed directly (not when imported by tests for canonFlag/canonClass).
if (require.main === module) main();
