import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import sanitizeHtml from 'sanitize-html';

export interface AlertContext {
  slug: string;
  consecutiveFailures: number;
  lastError?: string;
}

const lastAlertSent = new Map<string, number>();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
setInterval(() => lastAlertSent.clear(), 60 * 60 * 1000).unref?.();

/**
 * Fires an alert for a knowledge source that has failed multiple times.
 *
 * Input contract:
 * - slug: non-empty string (noop if empty)
 * - consecutiveFailures: finite positive integer >= 2 (noop if < 2 or invalid)
 * - lastError: optional string for additional context
 *
 * Best-effort: if Sentry throws, logs error and continues (no propagation).
 */
export async function fireAlert(ctx: AlertContext): Promise<void> {
  // Guard: empty slug
  if (!ctx.slug || ctx.slug.trim() === '') {
    return;
  }

  // Guard: invalid consecutiveFailures
  if (
    !Number.isFinite(ctx.consecutiveFailures) ||
    ctx.consecutiveFailures < 2
  ) {
    return;
  }

  try {
    Sentry.captureMessage(
      `Knowledge source ${ctx.slug} failed ${ctx.consecutiveFailures}× consecutively`,
      {
        level: 'error',
        tags: { knowledge_source: ctx.slug },
        extra: { ...ctx },
      }
    );
  } catch (err) {
    // Best-effort: don't propagate Sentry errors
    console.error('fireAlert failed (best-effort):', err);
  }

  // Throttle: one email per slug per ALERT_COOLDOWN_MS to prevent inbox floods
  const now = Date.now();
  const lastSent = lastAlertSent.get(ctx.slug);
  if (lastSent !== undefined && now - lastSent < ALERT_COOLDOWN_MS) {
    console.log(`[alerts] throttled ${ctx.slug}: last sent ${Math.round((now - lastSent) / 1000)}s ago`);
    return;
  }
  lastAlertSent.set(ctx.slug, now);

  // Fire-and-forget email notification (issue #179)
  void sendAlertEmail(ctx).catch(err => {
    console.error('sendAlertEmail failed (best-effort):', err);
  });
}

/**
 * Sends an alert email via Resend.
 * Requires RESEND_API_KEY + ALERT_EMAIL_TO env vars; no-op if either is absent.
 * Exported for unit testing; call sites use fire-and-forget via void.
 */
export async function sendAlertEmail(ctx: AlertContext): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const toRaw = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !toRaw) return;

  const resend = new Resend(apiKey);
  const to = toRaw.split(',').map(s => s.trim()).filter(Boolean);
  const from = process.env.RESEND_FROM_EMAIL ?? 'Quantika Alerts <alerts@quantika.app>';

  const safeSlug = sanitizeHtml(ctx.slug, { allowedTags: [], allowedAttributes: {} });
  const safeErr = sanitizeHtml(ctx.lastError ?? '', { allowedTags: [], allowedAttributes: {} });

  await resend.emails.send({
    from,
    to,
    subject: `[Quantika Alert] "${ctx.slug}" failed ${ctx.consecutiveFailures}× consecutively`,
    html: [
      `<p>Knowledge source <strong>${safeSlug}</strong> has failed`,
      `<strong>${ctx.consecutiveFailures}</strong> times consecutively.</p>`,
      safeErr ? `<p>Last error: <code>${safeErr}</code></p>` : '',
    ].join('\n'),
  });
}
