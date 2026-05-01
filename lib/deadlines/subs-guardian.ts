/**
 * Subs Deadline Guardian (β-10).
 *
 * «Subs» — subjects-removal в charter party. Этот модуль определяет текущую
 * стадию эскалации (24h / 8h / 4h / 2h / expired) и решает, какие каналы
 * нужно уведомить. Idempotent: если стадия уже в `notifiedStages`, повторный
 * вызов не дублирует нотификации — это критично для cron, который дёргается
 * каждые 30 мин.
 */

import { getChannelsForStage, type EscalationStage } from './escalation-policy';

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
    try {
      await dispatcher(ch.channel, deadline, ch.template, ch.priority);
      dispatched.push(ch.channel);
    } catch (err) {
      // Best-effort: один канал не должен ронять остальные.
      console.error(`[subs-guardian] dispatch ${ch.channel} failed`, err);
    }
  }

  // Mutate notifiedStages in-place so the caller can persist.
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
