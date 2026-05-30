/**
 * Research / acceptance harness (2026-05-30, Wave C) — top matches, broker view.
 *
 * Runs the REAL engine (`analyzePairs` with a no-op aiScorer → deterministic
 * sweep path) on the demo fixtures, then ranks the main "worth calling" list the
 * way a broker reads it: utilisation %, ballast leg (nm), readiness verdict, and
 * the final tier (good/possible). It flags which 'good' candidates were demoted
 * by the Wave C ballast + size cap (levers 3 + 4) and asserts the acceptance
 * invariant: no surviving 'good' match has a far ballast for its vessel class or
 * a low-util disproportion (unless it is a legitimate part-cargo).
 *
 * This replaces the brief's referenced `top-matches-broker-view.ts`, which was
 * absent from the worktree (only `match-realism-funnel.ts` shipped). Same data,
 * same engine math — the broker-readable ranking the acceptance criteria need.
 *
 * Run: npx tsx scripts/research/top-matches-broker-view.ts
 */
import cargoesFixture from '../../lib/sample-data/demo-parsed-cargoes.json';
import vesselsFixture from '../../lib/sample-data/demo-parsed-vessels.json';
import type { Match, ParsedCargo, ParsedVessel } from '../../lib/types';
import { cfValue } from '../../lib/types';
import { analyzePairs, type AiScorer } from '../../lib/matching/pair-analyzer';
import { classifyVesselByDwt } from '../../lib/sailing/readiness-gap';
import {
  BALLAST_GOOD_MAX_NM,
  PROPORTION_GOOD_MIN_UTIL,
  isPartCargo,
} from '../../lib/sailing/match-scoring';
import { rebaseParsedCargoes, rebaseParsedVessels } from '../../lib/sample-data/rebase-parsed';

// 2026-05-01 = the funnel's best-case reference date (fewest expired laycans).
const TODAY = new Date(Date.UTC(2026, 4, 1));
const REF_YEAR = 2026;

const cargos = rebaseParsedCargoes(cargoesFixture as unknown as ParsedCargo[], TODAY);
const vessels = rebaseParsedVessels(vesselsFixture as unknown as ParsedVessel[], TODAY);

const offline: AiScorer = async () => [];

function findCargo(m: Match): ParsedCargo | undefined {
  return cargos.find((c) => c.emailId === m.cargoEmailId && c.itemIndex === m.cargoItemIndex);
}
function findVessel(m: Match): ParsedVessel | undefined {
  return vessels.find((v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex);
}

function vesselCapacity(v: ParsedVessel | undefined): number | null {
  if (!v) return null;
  const dwcc = cfValue(v.dwcc);
  if (dwcc != null && dwcc > 0) return dwcc;
  const dwt = cfValue(v.dwtSummer);
  return dwt != null && dwt > 0 ? dwt : null;
}
function cargoWeight(c: ParsedCargo | undefined): number | null {
  if (!c) return null;
  return c.weightMtMax ?? cfValue(c.weightMt);
}
function utilOf(m: Match): number | null {
  const cap = vesselCapacity(findVessel(m));
  const wt = cargoWeight(findCargo(m));
  return cap != null && wt != null && wt > 0 ? wt / cap : null;
}
function capFlag(m: Match): string {
  const issues = m.issues ?? [];
  const b = issues.some((i) => i.startsWith('BALLAST:'));
  const s = issues.some((i) => i.startsWith('SIZE:'));
  return b && s ? 'B+S' : b ? 'BAL' : s ? 'SIZE' : '';
}

async function main() {
  const result = await analyzePairs(cargos, vessels, offline, { refYear: REF_YEAR, today: TODAY });

  // Rank by the UNCAPPED score (scoreBreakdown.finalScore) so demoted false-goods
  // still appear where the broker would have first seen them — now marked.
  const ranked = [...result.matches].sort(
    (a, b) => (b.scoreBreakdown?.finalScore ?? b.score) - (a.scoreBreakdown?.finalScore ?? a.score),
  );

  const out: string[] = [];
  const p = (s: string) => out.push(s);

  p('═══════════════════════════════════════════════════════════════════════════');
  p(`TOP MATCHES — BROKER VIEW  (today=${TODAY.toISOString().slice(0, 10)}, refYear=${REF_YEAR})`);
  p('═══════════════════════════════════════════════════════════════════════════');
  const good = result.matches.filter((m) => m.matchLevel === 'good');
  const possible = result.matches.filter((m) => m.matchLevel === 'possible');
  const cappedBallast = result.matches.filter((m) => (m.issues ?? []).some((i) => i.startsWith('BALLAST:')));
  const cappedSize = result.matches.filter((m) => (m.issues ?? []).some((i) => i.startsWith('SIZE:')));
  p(`Main list: ${result.matches.length}   good: ${good.length}   possible: ${possible.length}`);
  p(`Capped good→possible:  ballast(lever 3)=${cappedBallast.length}   size(lever 4)=${cappedSize.length}`);
  p(`Buckets: lowConfidence=${result.lowConfidenceMatches.length}  insufficient=${result.insufficientData.length}  blocked=${result.blockedMatches.length}`);
  p('');
  p('Top 30 by uncapped score — CAP column shows the Wave C demotion (BAL/SIZE/B+S):');
  p('  #  rawScore  tier      CAP   util%  ballast  verdict   class       cargo');
  p('  ─────────────────────────────────────────────────────────────────────────────');
  ranked.slice(0, 30).forEach((m, idx) => {
    const c = findCargo(m);
    const v = findVessel(m);
    const raw = Math.round((m.scoreBreakdown?.finalScore ?? m.score) * 10) / 10;
    const util = utilOf(m);
    const dist = m.readiness?.distanceNm;
    const cls = classifyVesselByDwt(v ? cfValue(v.dwtSummer) : null);
    const desc = (cfValue(c?.cargoDescription ?? null) ?? '').slice(0, 30);
    p(
      `  ${String(idx + 1).padStart(2)}  ${String(raw).padStart(7)}  ${m.matchLevel.padEnd(8)}  ${capFlag(m).padEnd(4)}  ${(util != null ? Math.round(util * 100) + '%' : '—').padStart(5)}  ${(dist != null ? Math.round(dist) + 'nm' : '—').padStart(7)}  ${(m.readiness?.verdict ?? '—').padEnd(7)}  ${cls.padEnd(10)}  ${desc}`,
    );
  });
  p('');

  // ── Acceptance invariant ───────────────────────────────────────────────────
  const ballastOffenders = good.filter((m) => {
    const dist = m.readiness?.distanceNm;
    if (dist == null) return false;
    const cls = classifyVesselByDwt(findVessel(m) ? cfValue(findVessel(m)!.dwtSummer) : null);
    return dist > BALLAST_GOOD_MAX_NM[cls];
  });
  const sizeOffenders = good.filter((m) => {
    const c = findCargo(m);
    if (!c || isPartCargo(cfValue(c.cargoDescription))) return false;
    const util = utilOf(m);
    return util != null && util < PROPORTION_GOOD_MIN_UTIL;
  });
  const partCargoSurvivors = result.matches.filter(
    (m) => isPartCargo(cfValue(findCargo(m)?.cargoDescription ?? null)) && !(m.issues ?? []).some((i) => i.startsWith('SIZE:')),
  );

  p('── ACCEPTANCE ──────────────────────────────────────────────────────────────');
  p(`  good with far ballast for class (must be 0):     ${ballastOffenders.length}`);
  p(`  good with low-util non-part-cargo (must be 0):   ${sizeOffenders.length}`);
  p(`  part-cargo NOT size-capped (exemption holds):    ${partCargoSurvivors.length}`);
  const pass = ballastOffenders.length === 0 && sizeOffenders.length === 0;
  p(`  VERDICT: ${pass ? 'PASS — every surviving good is within ballast radius + util≥50% (or part-cargo)' : 'FAIL'}`);
  p('═══════════════════════════════════════════════════════════════════════════');

  console.log(out.join('\n'));
  if (!pass) process.exitCode = 1;
}

main();
