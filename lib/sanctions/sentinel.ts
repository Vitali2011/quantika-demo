/**
 * β-09: Sanction Sentinel — background scanner for active deals.
 *
 * Cross-references each active deal's counterparty / vessel / load port
 * against the local sanction corpus (and, optionally, OpenSanctions).
 * Generates `SentinelAlert` records and dispatches notifications.
 */

import {
  loadSanctionFixtures,
  type SanctionFlaggedEntity,
} from '@/lib/sample-data/sanction-corpus';
import {
  scoreMatch,
  type ScoredMatch,
} from '@/lib/sanctions/match-engine';
import { dispatchNotification } from '@/lib/notifications/dispatch';

export type SentinelSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SentinelAlert {
  dealId: string;
  counterparty: string;
  sanctionMatch: {
    name: string;
    list: string;
    matchedAt: string; // ISO date
    confidence: number;
  };
  severity: SentinelSeverity;
}

export interface ActiveDeal {
  id: string;
  counterpartyName?: string;
  vesselName?: string;
  vesselImo?: string;
  loadPort?: string;
  dischargePort?: string;
}

export interface ScanOptions {
  source?: 'opensanctions-update' | 'event-driven' | 'cron';
  since?: string;
  /** Active-deals provider — inject from caller (no DB coupling here). */
  dealsProvider?: () => ActiveDeal[] | Promise<ActiveDeal[]>;
  /** When true, dispatch a notification per alert. Defaults to false (dry-run). */
  dispatch?: boolean;
  /** Inject corpus for tests. Defaults to `loadSanctionFixtures()`. */
  corpus?: SanctionFlaggedEntity[];
}

// Re-export the helpers used by tests / external callers.
export { classifySeverity, scoreMatch } from '@/lib/sanctions/match-engine';

function buildCorpusFromFixtures(): SanctionFlaggedEntity[] {
  const out: SanctionFlaggedEntity[] = [];
  for (const fx of loadSanctionFixtures()) {
    if (!fx.expected.shouldFlag) continue;
    for (const e of fx.expected.flaggedEntities) out.push(e);
  }
  return out;
}

function checkOne(
  dealId: string,
  fieldName: string,
  candidate: { name: string; imo?: string },
  corpus: SanctionFlaggedEntity[],
): SentinelAlert | null {
  if (!candidate.name || !candidate.name.trim()) return null;
  const result: ScoredMatch = scoreMatch(candidate, corpus);
  if (!result.matched || !result.severity || !result.entity) return null;

  return {
    dealId,
    counterparty: candidate.name,
    sanctionMatch: {
      name: result.entity.name,
      list: result.list,
      matchedAt: new Date().toISOString(),
      confidence: Number(result.confidence.toFixed(3)),
    },
    severity: result.severity,
  };
}

export async function scanActiveDeals(
  opts: ScanOptions = {},
): Promise<SentinelAlert[]> {
  const corpus = opts.corpus ?? buildCorpusFromFixtures();
  const provider = opts.dealsProvider ?? (() => []);
  const deals = await provider();

  const alerts: SentinelAlert[] = [];

  for (const deal of deals) {
    const candidates: Array<{ field: string; name: string; imo?: string }> = [];
    if (deal.counterpartyName)
      candidates.push({ field: 'counterparty', name: deal.counterpartyName });
    if (deal.vesselName)
      candidates.push({
        field: 'vessel',
        name: deal.vesselName,
        imo: deal.vesselImo,
      });
    if (deal.loadPort) candidates.push({ field: 'loadPort', name: deal.loadPort });
    if (deal.dischargePort)
      candidates.push({ field: 'dischargePort', name: deal.dischargePort });

    // Highest-severity wins per deal.
    let bestAlert: SentinelAlert | null = null;
    const severityRank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    for (const c of candidates) {
      const a = checkOne(deal.id, c.field, { name: c.name, imo: c.imo }, corpus);
      if (!a) continue;
      if (
        !bestAlert ||
        severityRank[a.severity] > severityRank[bestAlert.severity]
      ) {
        bestAlert = a;
      }
    }
    if (bestAlert) alerts.push(bestAlert);
  }

  if (opts.dispatch) {
    for (const alert of alerts) {
      await dispatchNotification({
        channel: 'log',
        severity: alert.severity,
        title: `Sanction match: ${alert.counterparty} → ${alert.sanctionMatch.name}`,
        body:
          `Deal ${alert.dealId} flagged on ${alert.sanctionMatch.list} ` +
          `(confidence ${alert.sanctionMatch.confidence}, severity ${alert.severity}).`,
        meta: {
          dealId: alert.dealId,
          counterparty: alert.counterparty,
          list: alert.sanctionMatch.list,
          confidence: alert.sanctionMatch.confidence,
          source: opts.source ?? 'cron',
        },
      });
    }
  }

  return alerts;
}
