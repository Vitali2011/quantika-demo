import * as Sentry from '@sentry/nextjs';

export interface AlertContext {
  slug: string;
  consecutiveFailures: number;
  lastError?: string;
}

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
        extra: ctx,
      }
    );
  } catch (err) {
    // Best-effort: don't propagate Sentry errors
    console.error('fireAlert failed (best-effort):', err);
  }

  // TODO: email channel — for Phase 1 stub
}
