/**
 * Research tool (2026-05-29) — match-realism funnel.
 *
 * NOT part of the production engine. One-off analysis answering: "why does
 * 80 cargo × ~60 ships produce ~450 matches, and how many are realistic?"
 *
 * Reuses the engine's own math (runHardFilters + calculateReadinessGap) so the
 * baseline reflects what the app actually shows, then applies the soft criteria
 * (idle gap, ballast distance, size disproportion) as HARD cutoffs to count how
 * many pairs a real broker would actually consider.
 *
 * Run: npx tsx scripts/research/match-realism-funnel.ts
 */
import cargoesFixture from '../../lib/sample-data/demo-parsed-cargoes.json';
import vesselsFixture from '../../lib/sample-data/demo-parsed-vessels.json';
import type { ParsedCargo, ParsedVessel } from '../../lib/types';
import { cfValue } from '../../lib/types';
import { runHardFilters } from '../../lib/sailing/match-filters';
import { calculateReadinessGap, detectSpot } from '../../lib/sailing/readiness-gap';

const cargos = cargoesFixture as unknown as ParsedCargo[];
const vessels = vesselsFixture as unknown as ParsedVessel[];

// Reference "now" — pick a date where the bulk of laycans are still in the
// future (laycans cluster in May 2026). This is the BEST CASE for the engine
// (fewest expired windows), so the realistic count we derive is an upper bound.
const TODAY = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
const REF_YEAR = 2026;

interface PairRow {
  cargoIdx: number;
  vesselIdx: number;
  hardPass: boolean;
  verdict: string;
  distanceNm: number | null;
  gapDays: number | null;
  util: number | null; // cargo weight / vessel cargo capacity
  cargoType: string;
}

function cargoWeight(c: ParsedCargo): number | null {
  if (c.weightMtMin != null && c.weightMtMax != null) return c.weightMtMax;
  return cfValue(c.weightMt);
}
function vesselCapacity(v: ParsedVessel): number | null {
  const dwcc = cfValue(v.dwcc);
  if (dwcc != null && dwcc > 0) return dwcc;
  const dwt = cfValue(v.dwtSummer);
  if (dwt != null && dwt > 0) return dwt * 0.9;
  return null;
}

const rows: PairRow[] = [];
for (let ci = 0; ci < cargos.length; ci++) {
  const c = cargos[ci];
  for (let vi = 0; vi < vessels.length; vi++) {
    const v = vessels[vi];
    const hf = runHardFilters({
      cargoType: c.cargoType,
      originPort: cfValue(c.originPort),
      destinationPort: cfValue(c.destinationPort),
      weightMt:
        c.weightMtMin != null && c.weightMtMax != null && c.weightMtMin !== c.weightMtMax
          ? { min: c.weightMtMin, max: c.weightMtMax }
          : cfValue(c.weightMt),
      cargoDescription: cfValue(c.cargoDescription),
      stowageFactor: c.stowageFactor,
      vesselType: v.vesselType,
      geared: v.geared,
      draftMax: cfValue(v.draftMax),
      grainCapacity: v.grainCapacity,
      dwtSummer: cfValue(v.dwtSummer),
      dwcc: cfValue(v.dwcc),
    });

    const rawOpen = cfValue(v.openDate) as unknown as string;
    const isSpot = detectSpot(rawOpen);
    const r = calculateReadinessGap(
      {
        openDate: rawOpen,
        openPosition: cfValue(v.openPosition),
        speedLaden: v.speedLaden,
        dwtSummer: cfValue(v.dwtSummer),
        isSpot,
      },
      { laycan: c.laycan, originPort: cfValue(c.originPort) },
      { refYear: REF_YEAR, today: TODAY },
    );

    const cw = cargoWeight(c);
    const cap = vesselCapacity(v);
    const util = cw != null && cap != null && cap > 0 ? cw / cap : null;

    rows.push({
      cargoIdx: ci,
      vesselIdx: vi,
      hardPass: hf.pass,
      verdict: r.verdict,
      distanceNm: r.distanceNm,
      gapDays: r.gapDays,
      util,
      cargoType: c.cargoType,
    });
  }
}

const total = rows.length;
const hardPass = rows.filter((r) => r.hardPass);
// "late" includes expired laycan + arrival-after-laycan; engine hard-filters these.
const notLate = hardPass.filter((r) => r.verdict !== 'late');
// Baseline ≈ what the app surfaces as matches (passes hard filters, not late).
const baseline = notLate;

const verdictCounts = (rs: PairRow[]) =>
  rs.reduce<Record<string, number>>((m, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {});

function realistic(rs: PairRow[], ballastMax: number, utilMin: number, excludeIdle: boolean) {
  return rs.filter((r) => {
    if (r.verdict === 'late') return false;
    if (excludeIdle && r.verdict === 'idle') return false;
    if (r.verdict === 'unknown') return false; // can't assess timing/distance → not a live match
    if (r.distanceNm == null) return false;
    if (r.distanceNm > ballastMax) return false;
    if (r.util == null) return false;
    if (r.util < utilMin) return false;
    return true;
  });
}

const out: string[] = [];
const p = (s: string) => out.push(s);

p('═══════════════════════════════════════════════════════════════');
p(`MATCH-REALISM FUNNEL  (today=${TODAY.toISOString().slice(0, 10)}, refYear=${REF_YEAR})`);
p('═══════════════════════════════════════════════════════════════');
p(`Cargo records:  ${cargos.length}`);
p(`Vessel records: ${vessels.length}`);
p(`Total pairs:    ${total}`);
p('');
p('── Dataset shape ──');
p(`Cargo by type:  ${JSON.stringify(cargos.reduce<Record<string, number>>((m, c) => ((m[c.cargoType] = (m[c.cargoType] || 0) + 1), m), {}))}`);
const caps = vessels.map(vesselCapacity).filter((x): x is number => x != null).sort((a, b) => a - b);
p(`Vessel capacity (DWCC/DWT*0.9) min/median/max: ${Math.round(caps[0])} / ${Math.round(caps[Math.floor(caps.length / 2)])} / ${Math.round(caps[caps.length - 1])}`);
const spotV = vessels.filter((v) => detectSpot(cfValue(v.openDate) as unknown as string)).length;
p(`Spot vessels (openDate spot/prompt): ${spotV} / ${vessels.length}`);
p('');
p('── FUNNEL ──');
p(`1. Total pairs:                         ${total}`);
p(`2. Pass 7 hard filters:                 ${hardPass.length}  (${Math.round((hardPass.length / total) * 100)}%)`);
p(`3. ...and not late/expired (BASELINE):  ${baseline.length}  ← ≈ what the app surfaces as "matches"`);
p('');
p(`   Baseline verdict breakdown: ${JSON.stringify(verdictCounts(baseline))}`);
p(`   Baseline distance unknown (no nm):  ${baseline.filter((r) => r.distanceNm == null).length}`);
p(`   Baseline util<50% (size disprop.):  ${baseline.filter((r) => r.util != null && r.util < 0.5).length}`);
p('');
p('── REALISTIC ("worth calling": ideal/tight, known ballast, fits size) ──');
p('   Sensitivity grid — rows=ballast cap (nm), cols=min size utilisation; idle EXCLUDED:');
const ballasts = [1000, 1500, 2500];
const utils = [0.4, 0.5, 0.6];
p(`   ballast\\util   ${utils.map((u) => (u * 100).toFixed(0) + '%').join('     ')}`);
for (const b of ballasts) {
  const cells = utils.map((u) => String(realistic(baseline, b, u, true).length).padStart(4));
  p(`   ${String(b).padStart(5)} nm     ${cells.join('     ')}`);
}
p('');
const mid = realistic(baseline, 1500, 0.5, true);
const midInclIdle = realistic(baseline, 1500, 0.5, false);
p(`   Mid estimate (ballast≤1500nm, util≥50%, exclude idle): ${mid.length}`);
p(`   ...including idle (owner waits >5d):                   ${midInclIdle.length}`);
p('');
p('── PER-CARGO (tonnage-list size) ──');
const perCargo = new Map<number, number>();
for (const r of mid) perCargo.set(r.cargoIdx, (perCargo.get(r.cargoIdx) || 0) + 1);
const cargosWithAny = perCargo.size;
const vals = [...perCargo.values()].sort((a, b) => a - b);
const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / cargos.length).toFixed(1) : '0';
p(`   Cargoes with ≥1 realistic vessel: ${cargosWithAny} / ${cargos.length}`);
p(`   Realistic vessels per cargo — avg across ALL cargoes: ${avg}`);
p(`   ...among cargoes that have any: min/median/max = ${vals[0] ?? 0} / ${vals[Math.floor(vals.length / 2)] ?? 0} / ${vals[vals.length - 1] ?? 0}`);
p('');
p('── SEGMENTS & PARCELLING ──');
const byType = (t: string) => baseline.filter((r) => r.cargoType === t);
for (const t of ['BULK', 'BREAK_BULK', 'PROJECT', 'OTHER']) {
  const seg = byType(t);
  if (seg.length === 0) continue;
  p(`   ${t.padEnd(11)} baseline=${String(seg.length).padStart(4)}  realistic(mid)=${String(realistic(seg, 1500, 0.5, true).length).padStart(3)}`);
}
// Parcelling upper bound: handysize/breakbulk routinely load part-cargoes, so the
// size (util≥50%) gate is too strict for this fleet. Count timing+ballast only.
const parcelling = baseline.filter(
  (r) => (r.verdict === 'ideal' || r.verdict === 'tight') && r.distanceNm != null && r.distanceNm <= 1500,
);
p(`   Parcelling-aware (timing+ballast OK, size gate dropped): ${parcelling.length}`);
p(`   Assessable share of baseline (verdict≠unknown): ${baseline.filter((r) => r.verdict !== 'unknown').length} / ${baseline.length}`);
p('');
p('── SENSITIVITY TO "today" (data freshness) ──');
for (const t of [new Date(Date.UTC(2026, 4, 1)), new Date(Date.UTC(2026, 4, 29)), new Date(Date.UTC(2026, 5, 15))]) {
  let bl = 0;
  for (let ci = 0; ci < cargos.length; ci++) {
    for (let vi = 0; vi < vessels.length; vi++) {
      const c = cargos[ci], v = vessels[vi];
      const hf = runHardFilters({
        cargoType: c.cargoType, originPort: cfValue(c.originPort), destinationPort: cfValue(c.destinationPort),
        weightMt: c.weightMtMin != null && c.weightMtMax != null && c.weightMtMin !== c.weightMtMax ? { min: c.weightMtMin, max: c.weightMtMax } : cfValue(c.weightMt),
        cargoDescription: cfValue(c.cargoDescription), stowageFactor: c.stowageFactor, vesselType: v.vesselType,
        geared: v.geared, draftMax: cfValue(v.draftMax), grainCapacity: v.grainCapacity, dwtSummer: cfValue(v.dwtSummer), dwcc: cfValue(v.dwcc),
      });
      if (!hf.pass) continue;
      const rawOpen = cfValue(v.openDate) as unknown as string;
      const r = calculateReadinessGap({ openDate: rawOpen, openPosition: cfValue(v.openPosition), speedLaden: v.speedLaden, dwtSummer: cfValue(v.dwtSummer), isSpot: detectSpot(rawOpen) }, { laycan: c.laycan, originPort: cfValue(c.originPort) }, { refYear: REF_YEAR, today: t });
      if (r.verdict !== 'late') bl++;
    }
  }
  p(`   today=${t.toISOString().slice(0, 10)}: baseline (passes filters, not late) = ${bl}`);
}
p('═══════════════════════════════════════════════════════════════');

console.log(out.join('\n'));
