/**
 * recalibrate-port-da.ts
 *
 * De-inflates port-da-base.json by applying web-researched divisors
 * (VDA / DPWorld / Marlo benchmarks 2026-06-08):
 *
 *   port_dues_usd  ÷ 2
 *   pilotage_usd   ÷ 6
 *   tugs_usd       ÷ 2.5
 *
 * Each result is rounded to the nearest $100.
 * stevedoring_usd_per_mt, DWT bands, cargo_type, vessel codes are untouched.
 * source is updated to reflect the recalibration event.
 * confidence stays 'estimated'.
 *
 * Usage:
 *   npx tsx scripts/diag/recalibrate-port-da.ts
 *
 * Prints a before/after table for TRISK, ROCND, NLRTM, GBLIV, TRALI
 * plus min/median/max across all 54 ports for the 1000-9999 DWT bracket,
 * then writes the result back to scripts/seed-data/port-da-base.json.
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE_PATH = path.join(__dirname, '..', 'seed-data', 'port-da-base.json');
const NEW_SOURCE = 'recalibrated-2026-06-08 (VDA/DPWorld/Marlo benchmarks)';

interface Bracket {
  vessel_dwt_min: number;
  vessel_dwt_max: number;
  port_dues_usd: number;
  pilotage_usd: number;
  tugs_usd: number;
  stevedoring_usd_per_mt: number;
  cargo_type: string;
  confidence: string;
  source: string;
}

interface PortEntry {
  port_code: string;
  port_name: string;
  brackets: Bracket[];
}

function round100(v: number): number {
  return Math.round(v / 100) * 100;
}

function recalibrateBracket(b: Bracket): Bracket {
  return {
    ...b,
    port_dues_usd: round100(b.port_dues_usd / 2),
    pilotage_usd: round100(b.pilotage_usd / 6),
    tugs_usd: round100(b.tugs_usd / 2.5),
    source: NEW_SOURCE,
  };
}

function main(): void {
  const raw = fs.readFileSync(BASE_PATH, 'utf8');
  const data: PortEntry[] = JSON.parse(raw);

  // -------------------------------------------------------------------------
  // Spot-check report: TRISK, ROCND, NLRTM, GBLIV, TRALI (1000-9999 bracket)
  // -------------------------------------------------------------------------
  const REPORT_CODES = ['TRISK', 'ROCND', 'NLRTM', 'GBLIV', 'TRALI'];
  const SMALL_DWT_TEST = 5000; // falls in 1000-9999

  console.log('\n=== Before/After for key ports (lowest DWT bracket) ===\n');
  console.log(
    'Port     DWT-band          BEFORE total    AFTER total   (dues/pilot/tugs)\n' +
    '-'.repeat(78),
  );

  for (const port of data) {
    if (!REPORT_CODES.includes(port.port_code)) continue;
    for (const b of port.brackets) {
      if (!(b.vessel_dwt_min <= SMALL_DWT_TEST && b.vessel_dwt_max >= SMALL_DWT_TEST)) continue;
      const oldTotal = b.port_dues_usd + b.pilotage_usd + b.tugs_usd;
      const nb = recalibrateBracket(b);
      const newTotal = nb.port_dues_usd + nb.pilotage_usd + nb.tugs_usd;
      console.log(
        `${port.port_code.padEnd(8)} ` +
        `${String(b.vessel_dwt_min).padStart(5)}-${String(b.vessel_dwt_max).padEnd(7)} ` +
        `$${String(oldTotal).padStart(8)} → $${String(newTotal).padStart(8)}  ` +
        `(${nb.port_dues_usd}/${nb.pilotage_usd}/${nb.tugs_usd})`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Min/median/max for the 1000-9999 bracket across all 54 ports
  // -------------------------------------------------------------------------
  const oldTotals: number[] = [];
  const newTotals: number[] = [];

  for (const port of data) {
    for (const b of port.brackets) {
      if (!(b.vessel_dwt_min <= SMALL_DWT_TEST && b.vessel_dwt_max >= SMALL_DWT_TEST)) continue;
      const nb = recalibrateBracket(b);
      oldTotals.push(b.port_dues_usd + b.pilotage_usd + b.tugs_usd);
      newTotals.push(nb.port_dues_usd + nb.pilotage_usd + nb.tugs_usd);
    }
  }

  function median(arr: number[]): number {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  }

  console.log('\n=== Min/median/max across all 54 ports (1 000-9 999 DWT bracket) ===\n');
  console.log(`  OLD: min=$${Math.min(...oldTotals).toLocaleString()}  median=$${median(oldTotals).toLocaleString()}  max=$${Math.max(...oldTotals).toLocaleString()}`);
  console.log(`  NEW: min=$${Math.min(...newTotals).toLocaleString()}  median=$${median(newTotals).toLocaleString()}  max=$${Math.max(...newTotals).toLocaleString()}`);

  // -------------------------------------------------------------------------
  // Validate web-research targets for TRISK and ROCND
  // -------------------------------------------------------------------------
  const targetRanges: Record<string, [number, number]> = {
    TRISK: [10_000, 14_000], // research range $10-14k
    ROCND: [12_000, 20_000], // research range $12-20k
  };

  let allInRange = true;
  for (const port of data) {
    const range = targetRanges[port.port_code];
    if (!range) continue;
    for (const b of port.brackets) {
      if (!(b.vessel_dwt_min <= SMALL_DWT_TEST && b.vessel_dwt_max >= SMALL_DWT_TEST)) continue;
      const nb = recalibrateBracket(b);
      const newTotal = nb.port_dues_usd + nb.pilotage_usd + nb.tugs_usd;
      const [lo, hi] = range;
      if (newTotal < lo || newTotal > hi) {
        console.warn(
          `\nWARN: ${port.port_code} new total $${newTotal.toLocaleString()} outside research range $${lo.toLocaleString()}-$${hi.toLocaleString()} — divisors still applied uniformly`,
        );
        allInRange = false;
      } else {
        console.log(`\nOK: ${port.port_code} new total $${newTotal.toLocaleString()} is within research range $${lo.toLocaleString()}-$${hi.toLocaleString()}`);
      }
    }
  }
  if (allInRange) {
    console.log('\nAll validated ports are within web-research ranges. ✓');
  }

  // -------------------------------------------------------------------------
  // Apply recalibration to all brackets and write output
  // -------------------------------------------------------------------------
  const recalibrated: PortEntry[] = data.map((port) => ({
    ...port,
    brackets: port.brackets.map(recalibrateBracket),
  }));

  fs.writeFileSync(BASE_PATH, JSON.stringify(recalibrated, null, 2) + '\n', 'utf8');
  console.log(`\nWrote recalibrated data to ${BASE_PATH}\n`);
}

main();
