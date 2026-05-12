/**
 * Subs Deadline Guardian (β-10).
 *
 * «Subs» — subjects-removal в charter party. Этот модуль определяет текущую
 * стадию эскалации (24h / 8h / 4h / 2h / expired) и решает, какие каналы
 * нужно уведомить. Idempotent: если стадия уже в `notifiedStages`, повторный
 * вызов не дублирует нотификации — это критично для cron, который дёргается
 * каждые 30 мин.
 *
 * DB-backed idempotency (βf3-03): tryRecordDispatch acts as the source of
 * truth across process restarts. In-memory notifiedStages[] is kept as a
 * fast-path to avoid a DB hit on every iteration of the same-process loop.
 */

import { getChannelsForStage, type EscalationStage } from './escalation-policy';
import { tryRecordDispatch } from '../db/queries/dispatches';

export type { EscalationStage } from './escalation-policy';

export interface SubsDeadline {
  dealId: string;
  counterparty: string;
  deadlineAt: string; // ISO
  removedAt?: string;
  stage: EscalationStage | 'pending';
  notifiedStages: EscalationStage[];
}

const HOUR_MS = 3_600_000;

export function computeStage(
  deadlineAt: string,
  now: Date = new Date(),
): EscalationStage | 'pending' {
  const remaining = new Date(deadlineAt).getTime() - now.getTime();
  if (remaining <= 0) return 'expired';
  if (remaining <= 2 * HOUR_MS) return '2h';
  if (remaining <= 4 * HOUR_MS) return '4h';
  if (remaining <= 8 * HOUR_MS) return '8h';
  if (remaining <= 24 * HOUR_MS) return '24h';
  return 'pending';
}

export interface ProcessResult {
  newStage: EscalationStage | 'pending';
  notificationsDispatched: string[];
  ctaShown: boolean;
}

export type DispatcherFn = (
  channel: 'in-app' | 'whatsapp' | 'gmail',
  deadline: SubsDeadline,
  template: string,
  priority: 'normal' | 'urgent',
) => Promise<void> | void;

const noopDispatcher: DispatcherFn = async () => {
  /* noop in tests */
};

export async function processDeadline(
  deadline: SubsDeadline,
  dispatcher: DispatcherFn = noopDispatcher,
  now: Date = new Date(),
): Promise<ProcessResult> {
  const newStage = computeStage(deadline.deadlineAt, now);

  if (newStage === 'pending') {
    return { newStage, notificationsDispatched: [], ctaShown: false };
  }

  // Idempotent guard — already notified for this stage.
  if (deadline.notifiedStages.includes(newStage)) {
    return {
      newStage,
      notificationsDispatched: [],
      ctaShown: newStage === '2h',
    };
  }

  const channels = getChannelsForStage(newStage);
  const dispatched: string[] = [];

  for (const ch of channels) {
    // DB-backed idempotency: tryRecordDispatch returns false if already recorded.
    // Falls back gracefully when DB is not initialised (e.g. unit tests without DB).
    let isNew = true;
    try {
      isNew = tryRecordDispatch(deadline.dealId, `${deadline.deadlineAt}`, newStage, ch.channel);
    } catch {
      // DB not initialised — fall through to dispatch (in-memory guard is still active above).
    }

    if (!isNew) {
      // Already dispatched in a previous process run; skip without calling dispatcher.
      continue;
    }

    try {
      await dispatcher(ch.channel, deadline, ch.template, ch.priority);
      dispatched.push(ch.channel);
    } catch (err) {
      // Best-effort: один канал не должен ронять остальные.
      console.error(`[subs-guardian] dispatch ${ch.channel} failed`, err);
    }
  }

  // Mutate notifiedStages in-place so the caller can persist (fast-path for same-process).
  if (!deadline.notifiedStages.includes(newStage)) {
    deadline.notifiedStages.push(newStage);
  }
  deadline.stage = newStage;

  return {
    newStage,
    notificationsDispatched: dispatched,
    ctaShown: newStage === '2h',
  };
}

// ============================================================================
// γ-08: Timezone-aware Banking Days
// ============================================================================

/**
 * Input Contract:
 * - startDate: invalid Date → throw TypeError
 * - startDate: null/undefined → throw TypeError
 * - timezone: empty/null/undefined → throw TypeError
 * - timezone: invalid IANA → throw RangeError
 * - days: NaN/±Infinity → throw RangeError
 * - days: negative → subtract banking days (valid)
 * - days: 0 → return startDate as-is
 * - days: non-integer → floor to integer
 * - holidays: empty/undefined → default to []
 */
export function addBankingDays(
  startDate: Date,
  days: number,
  timezone: string,
  holidays?: string[]
): Date {
  // Validate startDate
  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
    throw new TypeError('startDate must be a valid Date');
  }

  // Validate timezone
  if (!timezone || typeof timezone !== 'string') {
    throw new TypeError('timezone must be a non-empty string');
  }

  // Validate timezone is valid IANA
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new RangeError(`Invalid timezone: ${timezone}`);
  }

  // Validate days
  if (!Number.isFinite(days)) {
    throw new RangeError('days must be a finite number');
  }

  // Floor non-integer days
  const intDays = Math.floor(days);

  // Handle 0 days
  if (intDays === 0) {
    return new Date(startDate);
  }

  // Normalize holidays
  const holidaySet = new Set(holidays || []);

  // Direction: forward or backward
  const direction = intDays > 0 ? 1 : -1;
  const absDays = Math.abs(intDays);

  let current = new Date(startDate);
  let bankingDaysAdded = 0;

  while (bankingDaysAdded < absDays) {
    // Move to next/prev day
    current = new Date(current.getTime() + direction * 24 * 60 * 60 * 1000);

    // Check if it's a banking day
    if (isBankingDay(current, timezone, holidays)) {
      bankingDaysAdded++;
    }
  }

  return current;
}

/**
 * Input Contract:
 * - date: invalid Date → throw TypeError
 * - date: null/undefined → throw TypeError
 * - timezone: empty/null/undefined → throw TypeError
 * - timezone: invalid IANA → throw RangeError
 * - holidays: empty/undefined → default to []
 */
export function isBankingDay(
  date: Date,
  timezone: string,
  holidays?: string[]
): boolean {
  // Validate date
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new TypeError('date must be a valid Date');
  }

  // Validate timezone
  if (!timezone || typeof timezone !== 'string') {
    throw new TypeError('timezone must be a non-empty string');
  }

  // Validate timezone is valid IANA
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new RangeError(`Invalid timezone: ${timezone}`);
  }

  // Get local date in the specified timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDateStr = formatter.format(date); // YYYY-MM-DD

  // Check if it's a holiday
  const holidaySet = new Set(holidays || []);
  if (holidaySet.has(localDateStr)) {
    return false;
  }

  // Get day of week in the timezone
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  });
  const weekday = weekdayFormatter.format(date);

  // Saturday or Sunday = not a banking day
  return weekday !== 'Saturday' && weekday !== 'Sunday';
}

/**
 * Input Contract:
 * - tier: undefined/null/empty → return 0 (graceful fallback — no grace period)
 * - tier: invalid (not in union) → throw TypeError (exhaustive)
 * - tier: "blue-chip" → 1
 * - tier: "second" → 0
 * - tier: "weak" → 0
 */
export function getChartererGraceDays(
  tier?: 'blue-chip' | 'second' | 'weak'
): number {
  // Graceful fallback: no tier = no grace period
  if (!tier || typeof tier !== 'string') {
    return 0;
  }

  // Exhaustive check
  if (tier === 'blue-chip') {
    return 1;
  } else if (tier === 'second') {
    return 0;
  } else if (tier === 'weak') {
    return 0;
  } else {
    throw new TypeError(`Invalid tier: ${tier}`);
  }
}
