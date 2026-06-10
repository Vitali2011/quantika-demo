/**
 * Post-processes match reasons to ensure each contains at least one number.
 * Enriches numberless reasons with data from structured match fields.
 */
import { formatNumber } from '@/lib/utils';
import { now } from '@/lib/clock';

export interface MatchContext {
  vesselDwt?: number | null;
  vesselDwcc?: number | null;
  vesselGrainCapacity?: number | null;
  cargoWeightMt?: number | null;
  distanceNm?: number | null;
  gapDays?: number | null;
  craneCapacity?: string | null;
  vesselBuilt?: number | null;
  vesselLoa?: number | null;
}

const ENRICHMENT_RULES: Array<{
  pattern: RegExp;
  enrich: (ctx: MatchContext) => string | null;
}> = [
  {
    pattern: /geared|crane|gear/i,
    enrich: (ctx) => {
      if (ctx.craneCapacity) return `Vessel geared (${ctx.craneCapacity})`;
      if (ctx.vesselDwt) return `Vessel geared on ${formatNumber(ctx.vesselDwt)} DWT carrier`;
      // TODO(I-MIN follow-up): gearless+discharge-crane enrichment needs ctx.dischargeHasCranes
      return null;
    },
  },
  {
    pattern: /fits?|within|carries|capacity|suitable|size/i,
    enrich: (ctx) => {
      if (ctx.cargoWeightMt && ctx.vesselDwcc) {
        const util = Math.round((ctx.cargoWeightMt / ctx.vesselDwcc) * 100);
        return `DWCC ${formatNumber(ctx.vesselDwcc)} mt vs cargo ${formatNumber(ctx.cargoWeightMt)} mt — ${util}% utilization`;
      }
      if (ctx.cargoWeightMt && ctx.vesselDwt) {
        return `Cargo ${formatNumber(ctx.cargoWeightMt)} mt on ${formatNumber(ctx.vesselDwt)} DWT vessel`;
      }
      return null;
    },
  },
  {
    pattern: /proxim|distance|close|nearby|regional|ballast/i,
    enrich: (ctx) => {
      if (ctx.distanceNm) return `~${Math.round(ctx.distanceNm)} nm ballast`;
      return null;
    },
  },
  {
    pattern: /timing|laycan|arrival|readiness|idle|ideal/i,
    enrich: (ctx) => {
      if (ctx.gapDays != null) return `${Math.abs(Math.round(ctx.gapDays))} days ${ctx.gapDays >= 0 ? 'before' : 'after'} laycan start`;
      return null;
    },
  },
  {
    pattern: /built|age|year|modern|old/i,
    enrich: (ctx) => {
      if (ctx.vesselBuilt) return `Vessel built ${ctx.vesselBuilt} (${now().getFullYear() - ctx.vesselBuilt} years old)`;
      return null;
    },
  },
];

export function hasDigit(s: string): boolean {
  return /\d/.test(s);
}

export function enrichReasons(
  reasons: string[],
  issues: string[],
  ctx: MatchContext,
): { reasons: string[]; issues: string[] } {
  const enrichedReasons: string[] = [];
  const newIssues = [...issues];

  for (const reason of reasons) {
    if (hasDigit(reason)) {
      // Already has a number — keep as-is
      enrichedReasons.push(reason);
      continue;
    }

    // Try to enrich
    let enriched = false;
    for (const rule of ENRICHMENT_RULES) {
      if (rule.pattern.test(reason)) {
        const replacement = rule.enrich(ctx);
        if (replacement && hasDigit(replacement)) {
          enrichedReasons.push(replacement);
          enriched = true;
          break;
        }
      }
    }

    if (!enriched) {
      // Can't enrich — move to issues
      newIssues.push(reason);
    }
  }

  return { reasons: enrichedReasons, issues: newIssues };
}
