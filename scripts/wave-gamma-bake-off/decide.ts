/**
 * Decision engine for Wave γ parsing bake-off — Task 7.
 *
 * Picks a winner per endpoint via the 5-step algorithm:
 *   1. DISQUALIFY  — drop models with criticalIssues > 0
 *   2. QUALITY GATE — drop models where parityRate + betterRate < gate
 *                     (gate is lower in Mode B; see `recordsHasReference`)
 *   3. COST RANK    — sort qualified by costPer1kCalls ascending
 *   4. TIEBREAK     — within 10% cost band, prefer higher (parity+better),
 *                     then lower avgLatencyMs
 *   5. RECOMMEND    — top of the ranked list wins
 *
 * If no model passes the gate, winner = "DEFERRED" with rationale
 * explaining why (no qualifiers, all crit, etc.).
 */

import type { AggregateRow } from './aggregate';
import type { Endpoint } from './corpus';

export interface DecideOptions {
  /** Mode A gate (default 0.85). */
  qualityGate?: number;
  /** Mode B gate (default 0.80) — applied per-endpoint when no reference exists. */
  modeBLowerGate?: number;
  /**
   * Per-endpoint flag: true if at least one record had a reference (Mode A
   * was used for that endpoint), false if Mode B globally for that endpoint.
   * Defaults to all-true when omitted (i.e. apply Mode A gate).
   */
  recordsHasReference?: Partial<Record<Endpoint, boolean>>;
  /**
   * Gate selection mode:
   *  - "strict" (default): use parityRate + betterRate >= gate (legacy).
   *  - "practical": use passRate >= practicalPassGate AND criticalIssues===0.
   *    Designed for in-house baseline scenarios (e.g. Pro 2.5 self-anchor)
   *    where Flash variants will inherently DEGRADE relative to baseline.
   */
  gateMode?: 'strict' | 'practical';
  /** Practical-mode passRate threshold (default 0.80). */
  practicalPassGate?: number;
}

export interface RankedEntry {
  model: string;
  cost: number;
  parityPlusBetter: number;
}

export interface DecisionPerEndpoint {
  endpoint: Endpoint;
  winner: string; // ModelId or "DEFERRED"
  rationale: string;
  disqualified: string[];
  qualified: string[];
  rankedByCost: RankedEntry[];
  flags: string[];
}

const DEFAULT_GATE_A = 0.85;
const DEFAULT_GATE_B = 0.80;
const DEFAULT_PRACTICAL_GATE = 0.80;
const COST_BAND = 0.10;

export function decide(
  rows: AggregateRow[],
  opts: DecideOptions = {},
): Record<string, DecisionPerEndpoint> {
  const gateA = opts.qualityGate ?? DEFAULT_GATE_A;
  const gateB = opts.modeBLowerGate ?? DEFAULT_GATE_B;
  const gateMode = opts.gateMode ?? 'strict';
  const practicalGate = opts.practicalPassGate ?? DEFAULT_PRACTICAL_GATE;
  const hasRef = opts.recordsHasReference ?? {};

  const byEndpoint = new Map<Endpoint, AggregateRow[]>();
  for (const r of rows) {
    let bucket = byEndpoint.get(r.endpoint);
    if (!bucket) {
      bucket = [];
      byEndpoint.set(r.endpoint, bucket);
    }
    bucket.push(r);
  }

  const result: Record<string, DecisionPerEndpoint> = {};

  for (const [endpoint, bucket] of byEndpoint.entries()) {
    const isModeB = hasRef[endpoint] !== true;
    const gate = isModeB ? gateB : gateA;

    const flags: string[] = [];
    if (isModeB) flags.push('mode-b');
    if (gateMode === 'practical') flags.push('practical-gate');

    // Step 1: disqualify on critical issues
    const disqualifiedRows = bucket.filter((r) => r.criticalIssues > 0);
    const passedCrit = bucket.filter((r) => r.criticalIssues === 0);

    // Step 2: quality gate (strict or practical)
    const qualifiedRows =
      gateMode === 'practical'
        ? passedCrit.filter((r) => r.passRate >= practicalGate)
        : passedCrit.filter((r) => r.parityRate + r.betterRate >= gate);

    const disqualified = disqualifiedRows.map((r) => r.model);
    const failedGate =
      gateMode === 'practical'
        ? passedCrit.filter((r) => r.passRate < practicalGate).map((r) => r.model)
        : passedCrit
            .filter((r) => r.parityRate + r.betterRate < gate)
            .map((r) => r.model);

    // Step 3: rank by cost ascending
    const ranked = qualifiedRows
      .slice()
      .sort((a, b) => a.costPer1kCalls - b.costPer1kCalls);

    const rankedByCost: RankedEntry[] = ranked.map((r) => ({
      model: r.model,
      cost: r.costPer1kCalls,
      parityPlusBetter: r.parityRate + r.betterRate,
    }));

    if (ranked.length === 0) {
      const reasons: string[] = [];
      if (disqualifiedRows.length > 0) {
        reasons.push(`${disqualifiedRows.length} model(s) had critical issues`);
      }
      if (failedGate.length > 0) {
        if (gateMode === 'practical') {
          reasons.push(
            `${failedGate.length} model(s) below ${(practicalGate * 100).toFixed(0)}% passRate gate`,
          );
        } else {
          reasons.push(
            `${failedGate.length} model(s) below ${(gate * 100).toFixed(0)}% parity+better gate`,
          );
        }
      }
      if (reasons.length === 0) reasons.push('no candidates evaluated');
      result[endpoint] = {
        endpoint,
        winner: 'DEFERRED',
        rationale: `No qualifying model: ${reasons.join('; ')}.`,
        disqualified,
        qualified: [],
        rankedByCost,
        flags,
      };
      continue;
    }

    // Step 4: tiebreak — within 10% cost band of cheapest, prefer higher
    // parity+better, then lower latency. Build the band then pick.
    const cheapest = ranked[0];
    const bandTop = cheapest.costPer1kCalls * (1 + COST_BAND);
    const band = ranked.filter((r) => r.costPer1kCalls <= bandTop);
    band.sort((a, b) => {
      if (gateMode === 'practical') {
        if (b.passRate !== a.passRate) return b.passRate - a.passRate;
        return a.avgLatencyMs - b.avgLatencyMs;
      }
      const qa = a.parityRate + a.betterRate;
      const qb = b.parityRate + b.betterRate;
      if (qb !== qa) return qb - qa;
      return a.avgLatencyMs - b.avgLatencyMs;
    });
    const winner = band[0];

    if (qualifiedRows.length === 1) flags.push('single-passing');
    if (/preview/i.test(winner.model)) flags.push('preview-stability-risk');

    const rationale =
      gateMode === 'practical'
        ? `Cheapest qualifying model${band.length > 1 ? ` within ${(COST_BAND * 100).toFixed(0)}% cost band of ${cheapest.model}` : ''}. ` +
          `passRate=${(winner.passRate * 100).toFixed(1)}% ` +
          `(practical gate ${(practicalGate * 100).toFixed(0)}%, 0 crit), cost/1k=$${winner.costPer1kCalls.toFixed(4)}, ` +
          `p50 latency=${Math.round(winner.avgLatencyMs)}ms.`
        : `Cheapest qualifying model${band.length > 1 ? ` within ${(COST_BAND * 100).toFixed(0)}% cost band of ${cheapest.model}` : ''}. ` +
          `parity+better=${((winner.parityRate + winner.betterRate) * 100).toFixed(1)}% ` +
          `(gate ${(gate * 100).toFixed(0)}%), cost/1k=$${winner.costPer1kCalls.toFixed(4)}, ` +
          `p50 latency=${Math.round(winner.avgLatencyMs)}ms.`;

    result[endpoint] = {
      endpoint,
      winner: winner.model,
      rationale,
      disqualified,
      qualified: qualifiedRows.map((r) => r.model),
      rankedByCost,
      flags,
    };
  }

  return result;
}
