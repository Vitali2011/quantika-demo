/**
 * Broker-view acceptance harness (fit-loop 2026-05-31).
 *
 * Drives the REAL engine (`analyzePairs` with a no-op aiScorer → deterministic
 * sweep path) on the demo fixtures, then prints each pair the way a senior
 * dry-bulk broker reads it:
 *
 *   fit-% (headline) · per-factor breakdown · applied cap (if any) ·
 *   util · ballast · timing · vessel class · cargo desc.
 *
 * Acceptance gates (anchors from LOOP-LOG.md):
 *   ANCHOR-HIGH       a 'good'-tier pair with util ≥ 88% and ballast ≪ class
 *                     radius must score fit ≥ 80.
 *   ANCHOR-LOW-UTIL   every non-part-cargo pair with util < 0.40 must score
 *                     fit < 60 (gating cap at 54 + small per-factor drift).
 *   ANCHOR-LOW-BAL    every pair with ballast > 2× class radius must score
 *                     fit < 60.
 *   ANCHOR-LATE       every 'late'-verdict survivor (none should reach `matches`,
 *                     but if it did) must score fit < 40.
 *   ANCHOR-PARTCARGO  every part-cargo pair must score fit ≥ 50 regardless
 *                     of utilisation.
 *   MONOTONICITY      among same-cargo pairs, shorter ballast → higher fit
 *                     (no inversions).
 *   DATE-INDEPENDENCE running with today=2026-05-01 vs today=2030-01-01 with
 *                     the same refYear must produce identical fit-% on every
 *                     non-spot pair.
 *
 * Exit 0 on PASS, exit 1 on any anchor violation.
 *
 * Run: npx tsx scripts/research/top-matches-broker-view.ts
 */
import cargoesFixture from '../../lib/sample-data/demo-parsed-cargoes.json';
import vesselsFixture from '../../lib/sample-data/demo-parsed-vessels.json';
import type { Match, ParsedCargo, ParsedVessel, FitBreakdown } from '../../lib/types';
import { cfValue } from '../../lib/types';
import { analyzePairs, type AiScorer } from '../../lib/matching/pair-analyzer';
import { classifyVesselByDwt, detectSpot } from '../../lib/sailing/readiness-gap';
import { BALLAST_GOOD_MAX_NM, isPartCargo } from '../../lib/sailing/match-scoring';
import { rebaseParsedCargoes, rebaseParsedVessels } from '../../lib/sample-data/rebase-parsed';

const REF_YEAR = 2026;
const TODAY_PRIMARY = new Date(Date.UTC(2026, 4, 1));   // 2026-05-01
const TODAY_FUTURE  = new Date(Date.UTC(2030, 0, 1));   // 2030-01-01

const offline: AiScorer = async () => [];

function findCargo(c: ParsedCargo[], m: Match): ParsedCargo | undefined {
  return c.find((x) => x.emailId === m.cargoEmailId && x.itemIndex === m.cargoItemIndex);
}
function findVessel(v: ParsedVessel[], m: Match): ParsedVessel | undefined {
  return v.find((x) => x.emailId === m.vesselEmailId && x.itemIndex === m.vesselItemIndex);
}
function fmt(n: number | null | undefined, suf = '', w = 6): string {
  if (n == null || !Number.isFinite(n)) return '—'.padStart(w);
  const s = `${Math.round(n)}${suf}`;
  return s.padStart(w);
}

function pairKey(m: Match): string {
  return `${m.cargoEmailId}|${m.cargoItemIndex}|${m.vesselEmailId}|${m.vesselItemIndex}`;
}

interface AnchorOutcome {
  name: string;
  pass: boolean;
  detail: string;
  offenders: number;
}

function checkAnchors(matches: Match[], cargos: ParsedCargo[], vessels: ParsedVessel[]): AnchorOutcome[] {
  const out: AnchorOutcome[] = [];

  // HIGH — a good-tier pair with util ≥ 0.88 and ballast within 0.4×radius → fit ≥ 80.
  {
    const eligible = matches.filter((m) => {
      const fb = m.fitBreakdown;
      if (!fb) return false;
      const v = findVessel(vessels, m);
      if (!v) return false;
      const dwt = cfValue(v.dwtSummer);
      if (!dwt) return false;
      const radius = BALLAST_GOOD_MAX_NM[classifyVesselByDwt(dwt)];
      return (fb.inputs.utilisation ?? 0) >= 0.88
        && (fb.inputs.distanceNm ?? Infinity) <= radius * 0.4
        && m.readiness?.verdict === 'ideal'
        && !fb.partCargo;
    });
    const offenders = eligible.filter((m) => (m.fitPercent ?? 0) < 80);
    out.push({
      name: 'ANCHOR-HIGH (util≥88% + short-ballast + ideal → fit≥80)',
      pass: offenders.length === 0,
      detail: `${eligible.length} eligible pair(s); ${offenders.length} below fit 80`,
      offenders: offenders.length,
    });
  }

  // LOW-UTIL — non-part-cargo util < 0.40 must score fit < 60.
  {
    const eligible = matches.filter((m) => {
      const fb = m.fitBreakdown;
      if (!fb || fb.partCargo) return false;
      return (fb.inputs.utilisation ?? 1) < 0.40;
    });
    const offenders = eligible.filter((m) => (m.fitPercent ?? 0) >= 60);
    out.push({
      name: 'ANCHOR-LOW-UTIL (non-part util<40% → fit<60)',
      pass: offenders.length === 0,
      detail: `${eligible.length} eligible pair(s); ${offenders.length} above fit 60`,
      offenders: offenders.length,
    });
  }

  // LOW-BAL — ballast > 2× class radius → fit < 60.
  {
    const eligible = matches.filter((m) => {
      const fb = m.fitBreakdown;
      const v = findVessel(vessels, m);
      if (!fb || !v) return false;
      const dwt = cfValue(v.dwtSummer);
      if (!dwt || fb.inputs.distanceNm == null) return false;
      const radius = BALLAST_GOOD_MAX_NM[classifyVesselByDwt(dwt)];
      return fb.inputs.distanceNm > 2 * radius;
    });
    const offenders = eligible.filter((m) => (m.fitPercent ?? 0) >= 60);
    out.push({
      name: 'ANCHOR-LOW-BAL (ballast >2× class radius → fit<60)',
      pass: offenders.length === 0,
      detail: `${eligible.length} eligible pair(s); ${offenders.length} above fit 60`,
      offenders: offenders.length,
    });
  }

  // LATE — any 'late' verdict survivor in main list → fit < 40 (should be 0 such).
  {
    const eligible = matches.filter((m) => m.readiness?.verdict === 'late');
    const offenders = eligible.filter((m) => (m.fitPercent ?? 0) >= 40);
    out.push({
      name: 'ANCHOR-LATE (late verdict → fit<40)',
      pass: offenders.length === 0,
      detail: `${eligible.length} eligible pair(s); ${offenders.length} above fit 40`,
      offenders: offenders.length,
    });
  }

  // PARTCARGO — part-cargo pairs must score fit ≥ 50.
  {
    const eligible = matches.filter((m) => {
      const c = findCargo(cargos, m);
      return c && isPartCargo(cfValue(c.cargoDescription));
    });
    const offenders = eligible.filter((m) => (m.fitPercent ?? 0) < 50);
    out.push({
      name: 'ANCHOR-PARTCARGO (part-cargo → fit≥50)',
      pass: offenders.length === 0,
      detail: `${eligible.length} eligible pair(s); ${offenders.length} below fit 50`,
      offenders: offenders.length,
    });
  }

  // MONOTONICITY (broker-loop 2026-05-31) — within tightly-matched neighbour
  // groups, longer ballast must never raise fit by more than a small slack.
  // The bucket key holds everything-but-ballast roughly constant: same cargo,
  // same vessel class, same readiness verdict, same gearing, same part-cargo
  // flag. Cross-vessel quality dims (cargo type history, crane availability,
  // exact DWT) still vary across the bucket → 5-pt slack absorbs that, which
  // matches the brief's "neighbour-pair" intent without demanding identical
  // vessels (impossible across the demo fleet).
  //
  // Per-factor strict monotonicity is enforced in the fit-breakdown unit suite.
  {
    const buckets = new Map<string, Match[]>();
    for (const m of matches) {
      const v = findVessel(vessels, m);
      const fb = m.fitBreakdown;
      if (!fb || !v) continue;
      const dwt = cfValue(v.dwtSummer);
      const cls = dwt ? classifyVesselByDwt(dwt) : 'unknown';
      const geared = v.geared === true ? 'G' : v.geared === false ? 'g' : '?';
      const partCargoFlag = fb.partCargo ? 'P' : '_';
      const key = `${m.cargoEmailId}|${m.cargoItemIndex}|${cls}|${fb.inputs.verdict}|${geared}|${partCargoFlag}`;
      const arr = buckets.get(key) ?? [];
      arr.push(m);
      buckets.set(key, arr);
    }
    let inversions = 0;
    let comparable = 0;
    const examples: string[] = [];
    for (const arr of buckets.values()) {
      const sortable = arr.filter((m) => m.fitBreakdown?.inputs.distanceNm != null);
      sortable.sort((a, b) => (a.fitBreakdown!.inputs.distanceNm! - b.fitBreakdown!.inputs.distanceNm!));
      for (let i = 1; i < sortable.length; i++) {
        comparable++;
        const prev = sortable[i - 1].fitPercent ?? 0;
        const cur = sortable[i].fitPercent ?? 0;
        if (cur > prev + 5) {
          inversions++;
          if (examples.length < 3) {
            examples.push(
              `cargo ${sortable[i].cargoEmailId} | prev d=${sortable[i - 1].fitBreakdown!.inputs.distanceNm}nm fit=${prev}% → cur d=${sortable[i].fitBreakdown!.inputs.distanceNm}nm fit=${cur}%`,
            );
          }
        }
      }
    }
    out.push({
      name: 'MONOTONICITY (same cargo+class+verdict+geared+pc → fit non-increasing in ballast ±5 slack)',
      pass: inversions === 0,
      detail:
        inversions === 0
          ? `${comparable} ordered pair(s) checked, no inversions`
          : `${inversions} inversion(s) across ${comparable} ordered pair(s) — examples: ${examples.join('; ')}`,
      offenders: inversions,
    });
  }

  return out;
}

function printBreakdownTable(matches: Match[], cargos: ParsedCargo[], vessels: ParsedVessel[], lines: string[]): void {
  // Sort by fit-% desc; show top 20.
  const sorted = [...matches].sort((a, b) => (b.fitPercent ?? 0) - (a.fitPercent ?? 0));
  lines.push('');
  lines.push('Top 20 by fit-% (broker view) — columns are the 8 per-factor sub-scores (score / weight):');
  lines.push('   #   fit%  CAP  | util  timg  ball  cls  cargo  cran  vol  draft | util%  ballast  verdict  class       desc');
  lines.push('   ───────────────┼─────────────────────────────────────────────────┼─────────────────────────────────────────────');
  sorted.slice(0, 20).forEach((m, i) => {
    const fb = m.fitBreakdown!;
    const c = findCargo(cargos, m);
    const v = findVessel(vessels, m);
    const dwt = v ? cfValue(v.dwtSummer) : null;
    const cls = dwt ? classifyVesselByDwt(dwt) : '—';
    const desc = (cfValue(c?.cargoDescription ?? null) ?? '').slice(0, 32);
    const compMap = new Map(fb.components.map((c2) => [c2.factor, c2]));
    const cell = (factor: string): string => {
      const c2 = compMap.get(factor as never);
      if (!c2) return '   —  ';
      return `${Math.round(c2.score).toString().padStart(2)}/${c2.weight.toString().padStart(2)}`;
    };
    const cap = fb.appliedCap ? fb.appliedCap.ceiling.toString().padStart(2) : '  ';
    lines.push(
      `  ${(i + 1).toString().padStart(2)}  ${(m.fitPercent ?? 0).toString().padStart(5)}  ${cap}   |` +
      ` ${cell('utilisation')} ${cell('timing')} ${cell('ballast')} ${cell('classFit')} ${cell('cargoType')} ${cell('cranes')} ${cell('volume')} ${cell('draft')} |` +
      ` ${(fb.inputs.utilisation != null ? Math.round(fb.inputs.utilisation * 100) + '%' : '—').padStart(5)}` +
      `  ${fmt(fb.inputs.distanceNm, 'nm', 7)}  ${(fb.inputs.verdict ?? '—').padEnd(7)}  ${cls.padEnd(10)}  ${desc}`,
    );
  });
}

function printControlPairs(
  matches: Match[],
  cargos: ParsedCargo[],
  vessels: ParsedVessel[],
  lines: string[],
): void {
  lines.push('');
  lines.push('── Adversarial control pairs (intentionally hostile cases) ──');
  const controls: Array<{ label: string; pick: (m: Match) => boolean }> = [
    { label: 'far ballast for class (>2× radius)', pick: (m) => {
      const v = findVessel(vessels, m); if (!v) return false;
      const dwt = cfValue(v.dwtSummer); if (!dwt) return false;
      const r = BALLAST_GOOD_MAX_NM[classifyVesselByDwt(dwt)];
      const d = m.fitBreakdown?.inputs.distanceNm ?? 0;
      return d > 2 * r;
    } },
    { label: 'low util (<40%) non-part-cargo', pick: (m) => {
      const fb = m.fitBreakdown; if (!fb || fb.partCargo) return false;
      return (fb.inputs.utilisation ?? 1) < 0.40;
    } },
    { label: 'part-cargo low util (<20%)', pick: (m) => {
      const fb = m.fitBreakdown; if (!fb || !fb.partCargo) return false;
      return (fb.inputs.utilisation ?? 1) < 0.20;
    } },
    { label: "vessel opens AFTER laycan (verdict='late')", pick: (m) => m.readiness?.verdict === 'late' },
    { label: 'idle gap > 21d', pick: (m) => m.readiness?.verdict === 'idle' && (m.readiness?.gapDays ?? 0) > 21 },
  ];
  for (const ctrl of controls) {
    const examples = matches.filter(ctrl.pick).slice(0, 3);
    if (examples.length === 0) {
      lines.push(`  ${ctrl.label}: (none in main list — already routed to a bucket)`);
      continue;
    }
    lines.push(`  ${ctrl.label}: ${examples.length} example(s) in main list`);
    for (const m of examples) {
      const fb = m.fitBreakdown!;
      const c = findCargo(cargos, m);
      const desc = (cfValue(c?.cargoDescription ?? null) ?? '').slice(0, 30);
      lines.push(`    · fit=${fb.fitPercent}%  cap=${fb.appliedCap?.ceiling ?? '—'}  util=${Math.round((fb.inputs.utilisation ?? 0) * 100)}%  ballast=${fmt(fb.inputs.distanceNm, 'nm', 5)}  verdict=${fb.inputs.verdict}  | ${desc}`);
    }
  }
}

async function runFor(today: Date, opts: { rebase: boolean } = { rebase: true }): Promise<{ result: Awaited<ReturnType<typeof analyzePairs>>; cargos: ParsedCargo[]; vessels: ParsedVessel[] }> {
  const cargos = opts.rebase
    ? rebaseParsedCargoes(cargoesFixture as unknown as ParsedCargo[], today)
    : (cargoesFixture as unknown as ParsedCargo[]);
  const vessels = opts.rebase
    ? rebaseParsedVessels(vesselsFixture as unknown as ParsedVessel[], today)
    : (vesselsFixture as unknown as ParsedVessel[]);
  const result = await analyzePairs(cargos, vessels, offline, { refYear: REF_YEAR, today });
  return { result, cargos, vessels };
}

async function main(): Promise<void> {
  // Primary: rebased fixtures (realistic broker view of relative dates).
  const primary = await runFor(TODAY_PRIMARY, { rebase: true });
  // Date-indep proof: NO rebase, so input dates are identical across the two
  // today values. Only the engine's optional `today` param differs — if scoring
  // is date-independent, every (cargo,vessel) pair produces the same fit-%.
  const rawPrimary = await runFor(TODAY_PRIMARY, { rebase: false });
  const rawFuture  = await runFor(TODAY_FUTURE,  { rebase: false });

  const lines: string[] = [];
  const p = (s: string): void => { lines.push(s); };

  p('══════════════════════════════════════════════════════════════════════════════════');
  p(`BROKER VIEW — fit-% (fit-loop 2026-05-31)   refYear=${REF_YEAR}   today=${TODAY_PRIMARY.toISOString().slice(0, 10)}`);
  p('══════════════════════════════════════════════════════════════════════════════════');

  const m = primary.result.matches;
  const withFb = m.filter((x) => x.fitBreakdown);
  p(`main list: ${m.length}   with fitBreakdown: ${withFb.length}   lowConfidence: ${primary.result.lowConfidenceMatches.length}   insufficient: ${primary.result.insufficientData.length}   blocked: ${primary.result.blockedMatches.length}`);

  printBreakdownTable(withFb, primary.cargos, primary.vessels, lines);
  printControlPairs(withFb, primary.cargos, primary.vessels, lines);

  // ── Anchor scorecard ───────────────────────────────────────────────────
  const anchors = checkAnchors(withFb, primary.cargos, primary.vessels);
  p('');
  p('── ANCHOR SCORECARD ──────────────────────────────────────────────────────────');
  for (const a of anchors) {
    p(`  ${a.pass ? '✓' : '✗'}  ${a.name}`);
    p(`        ${a.detail}`);
  }

  // ── Date-independence — compare fit-% on RAW (un-rebased) fixtures across
  //    two today values. Same inputs → same fit-% if scoring is date-indep.
  //    Excludes spot vessels (they intentionally pin open=today via clock).
  p('');
  p('── DATE-INDEPENDENCE (raw fixtures, today=2026-05-01 vs today=2030-01-01) ───');
  const allRaw = [...rawPrimary.result.matches, ...rawPrimary.result.lowConfidenceMatches, ...rawPrimary.result.insufficientData].filter((x) => x.fitBreakdown);
  const futureByKey = new Map<string, Match>();
  for (const x of [...rawFuture.result.matches, ...rawFuture.result.lowConfidenceMatches, ...rawFuture.result.insufficientData]) {
    if (x.fitBreakdown) futureByKey.set(pairKey(x), x);
  }
  let comparedDi = 0;
  let mismatched = 0;
  const mismatchExamples: string[] = [];
  for (const a of allRaw) {
    const b = futureByKey.get(pairKey(a));
    if (!b || !b.fitBreakdown) continue;
    const v = findVessel(rawPrimary.vessels, a);
    if (!v) continue;
    const spot = detectSpot(cfValue(v.openDate));
    if (spot) continue;
    comparedDi++;
    if (a.fitPercent !== b.fitPercent) {
      mismatched++;
      if (mismatchExamples.length < 5) {
        mismatchExamples.push(`pair ${pairKey(a)}: primary=${a.fitPercent}%, future=${b.fitPercent}%`);
      }
    }
  }
  p(`  compared (non-spot pairs with fit-% in both runs): ${comparedDi}`);
  p(`  fit-% mismatches:                                  ${mismatched}`);
  for (const ex of mismatchExamples) p(`    · ${ex}`);
  const dateIndepPass = mismatched === 0;
  p(`  ${dateIndepPass ? '✓' : '✗'}  date-independence on non-spot pairs (raw fixtures)`);

  // ── Verdict ────────────────────────────────────────────────────────────
  const anchorsPass = anchors.every((a) => a.pass);
  const verdict = anchorsPass && dateIndepPass;
  p('');
  p(`VERDICT: ${verdict ? 'ACCEPT — every anchor + date-independence passes' : 'REJECT — see anchor offenders above'}`);
  p('══════════════════════════════════════════════════════════════════════════════════');

  console.log(lines.join('\n'));
  if (!verdict) process.exitCode = 1;
}

main();
