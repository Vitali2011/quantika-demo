import type Database from 'better-sqlite3';
import type { Match, MatchWorksheet } from '@/lib/types';
import { classifyPriority, type PriorityLevel } from '@/lib/sailing/priority-classifier';
import { listQualifyingMatches } from './count-qualifying';
import type { StoredMatch } from './matches-repository';
import type { TodoCard } from '@/components/dashboard/DashboardTodoSection';
import type { FreshMatchItem } from '@/components/dashboard/DashboardFreshMatches';

const PRIORITY_ORDER: Record<PriorityLevel, number> = { urgent: 0, attention: 1, ok: 2 };

export interface DashboardSurfaces {
  /** Headline KPI: count of deduped, qualifying (fit >= 60) match rows. */
  openMatchCount: number;
  /** "To do today" cards — one per qualifying row, sorted by priority. */
  priorityCards: TodoCard[];
  /** "Fresh matches" rows — one per qualifying row, fit DESC. */
  freshMatchesData: FreshMatchItem[];
}

// Item-aware key (audit C.5, migration 051): aligns a session Match with its
// persisted StoredMatch row so list rows can be enriched with session-only data
// (confidence/readiness) that is never persisted to the matches table.
// ?? 0 covers StoredMatch's optional item columns (pre-044 rows).
function storedKey(
  cargoId: string,
  cargoIdx: number | null | undefined,
  vesselId: string,
  vesselIdx: number | null | undefined,
): string {
  return `${cargoId}|${cargoIdx ?? 0}|${vesselId}|${vesselIdx ?? 0}`;
}

function parseWorksheet(json: string | null | undefined): MatchWorksheet | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as MatchWorksheet;
  } catch {
    return null;
  }
}

/**
 * Derive ALL three dashboard match surfaces (KPI count + both lists) from one
 * deduped DB-row source so they can never diverge. The KPI count and the rendered
 * list length are guaranteed equal — `openMatchCount === priorityCards.length ===
 * freshMatchesData.length` — because all three come from the same
 * `listQualifyingMatches` result.
 *
 * Session matches are used only to enrich rows with confidence/readiness (not
 * persisted to the matches table); they never widen or narrow the row set.
 */
export function deriveDashboardSurfaces(
  db: Database.Database,
  sessionMatches: Match[],
  userId: string,
): DashboardSurfaces {
  const qualifying = listQualifyingMatches(db, { user_id: userId });

  const sessionByKey = new Map(
    sessionMatches.map((m) => [
      storedKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex),
      m,
    ]),
  );

  const enrich = (sm: StoredMatch) =>
    sessionByKey.get(storedKey(sm.cargo_id, sm.cargo_item_index, sm.vessel_id, sm.vessel_item_index));

  const priorityCards: TodoCard[] = qualifying
    .map((sm) => {
      const sMatch = enrich(sm);
      const worksheet = parseWorksheet(sm.worksheet_json);
      const gapDays = sMatch?.readiness?.gapDays ?? worksheet?.readiness?.gapDays ?? null;
      const readinessGap = gapDays != null ? gapDays * 24 : undefined;
      const priority = classifyPriority({ confidence: sMatch?.confidence, readinessGap });
      const matchSummary = sMatch?.matchReasons?.[0] || sm.reason || `Match #${sm.id}`;
      const keyInsight =
        sMatch?.readiness?.explanation ||
        worksheet?.readiness?.explanation ||
        `${Math.round(sm.fit_percent ?? 0)}% fit`;
      return { priority, matchSummary, keyInsight, href: `/match/${sm.id}` };
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const freshMatchesData: FreshMatchItem[] = qualifying.map((sm) => {
    const sMatch = enrich(sm);
    return {
      id: sm.id,
      score: sm.score,
      fit_percent: sm.fit_percent ?? null,
      matchLevel: sMatch?.matchLevel ?? 'good',
      matchReasons: sMatch?.matchReasons?.length ? sMatch.matchReasons : [sm.reason],
    };
  });

  return { openMatchCount: qualifying.length, priorityCards, freshMatchesData };
}
