/**
 * Minimal notifications dispatcher (β-09).
 *
 * The wave-β spec references `lib/notifications/` as if it already existed,
 * but it does not. This module provides a small, swappable surface so the
 * Sentinel scanner can dispatch alerts now and the real channel adapters
 * (email / Slack / PagerDuty) can plug in later via `setDispatcher`.
 */

import { logger } from '@/lib/logger';

export interface Notification {
  channel: 'email' | 'slack' | 'pagerduty' | 'log';
  title: string;
  body: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  meta?: Record<string, unknown>;
}

export type NotificationDispatcher = (n: Notification) => Promise<void> | void;

let activeDispatcher: NotificationDispatcher = async (n) => {
  // Default: structured log only (safe for cron / CI).
  logger.info(
    { channel: n.channel, severity: n.severity, title: n.title, meta: n.meta },
    `[notifications] ${n.severity.toUpperCase()} — ${n.title}`,
  );
};

export function setDispatcher(d: NotificationDispatcher): void {
  activeDispatcher = d;
}

export function resetDispatcher(): void {
  activeDispatcher = async (n) => {
    logger.info(
      { channel: n.channel, severity: n.severity, title: n.title, meta: n.meta },
      `[notifications] ${n.severity.toUpperCase()} — ${n.title}`,
    );
  };
}

export async function dispatchNotification(n: Notification): Promise<void> {
  await activeDispatcher(n);
}
