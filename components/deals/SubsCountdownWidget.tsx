/**
 * SubsCountdownWidget (γ-08) — Timezone-aware subs deadline countdown.
 *
 * Shows countdown to subs deadline with charterer grace indicator.
 * Behind NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED flag.
 */

'use client';

import React from 'react';
import { getChartererGraceDays, normalizeDeadline } from '@/lib/deadlines/subs-guardian';
import { useNow } from '@/lib/demo-clock-context';

export interface SubsCountdownWidgetProps {
  dealId: string;
  subsDeadline: string | number; // ISO 8601 or Unix seconds/ms
  chartererTier?: 'blue-chip' | 'second' | 'weak';
}

function computeRemaining(subsDeadline: string | number, nowMs: number): number {
  const deadline = normalizeDeadline(subsDeadline);
  return deadline.getTime() - nowMs;
}

// Inner component holds hooks; only mounted when flag is enabled.
function SubsCountdownInner({
  dealId,
  subsDeadline,
  chartererTier,
}: SubsCountdownWidgetProps) {
  // Single source of "now": DEMO_MODE → frozen snapshot time (constant, SSR-safe);
  // live → null until post-mount (deterministic placeholder, no #418), then a real
  // clock ticking every 60s. Hydration safety preserved by the null sentinel below.
  const nowMs = useNow(60_000);
  const remaining = nowMs !== null ? computeRemaining(subsDeadline, nowMs) : null;

  if (remaining === null) {
    return (
      <div data-testid={`subs-countdown-${dealId}`} suppressHydrationWarning>
        --
      </div>
    );
  }

  if (isNaN(remaining)) {
    return <div>Invalid deadline</div>;
  }

  let countdownText = '';
  if (remaining <= 0) {
    countdownText = 'Expired';
  } else {
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor(
      (remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
    );
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 0) {
      countdownText = `${days} days ${hours} hours remaining`;
    } else if (hours > 0) {
      countdownText = `${hours} hours ${minutes} minutes remaining`;
    } else {
      countdownText = `${minutes} minutes remaining`;
    }
  }

  const graceDays = getChartererGraceDays(chartererTier);
  const showGrace = graceDays > 0;

  return (
    <div data-testid={`subs-countdown-${dealId}`}>
      <div>{countdownText}</div>
      {showGrace && <div>+{graceDays} day{graceDays !== 1 ? 's' : ''} grace ({chartererTier})</div>}
    </div>
  );
}

export default function SubsCountdownWidget(props: SubsCountdownWidgetProps) {
  if (process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED !== 'true') {
    return null;
  }
  return <SubsCountdownInner {...props} />;
}
