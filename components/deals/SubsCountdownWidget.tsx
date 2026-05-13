/**
 * SubsCountdownWidget (γ-08) — Timezone-aware subs deadline countdown.
 *
 * Shows countdown to subs deadline with charterer grace indicator.
 * Behind NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED flag.
 */

'use client';

import React from 'react';
import { getChartererGraceDays, normalizeDeadline } from '@/lib/deadlines/subs-guardian';

export interface SubsCountdownWidgetProps {
  dealId: string;
  subsDeadline: string | number; // ISO 8601 or Unix seconds/ms
  chartererTier?: 'blue-chip' | 'second' | 'weak';
}

export default function SubsCountdownWidget({
  dealId,
  subsDeadline,
  chartererTier,
}: SubsCountdownWidgetProps) {
  // Feature flag check
  if (process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED !== 'true') {
    return null;
  }

  // Parse deadline — handles ISO string, Unix seconds, or Unix ms
  const deadline = normalizeDeadline(subsDeadline);
  if (isNaN(deadline.getTime())) {
    return <div>Invalid deadline</div>;
  }

  // Calculate remaining time
  const now = new Date();
  const remaining = deadline.getTime() - now.getTime();

  // Format countdown
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

  // Grace indicator
  const graceDays = getChartererGraceDays(chartererTier);
  const showGrace = graceDays > 0;

  return (
    <div data-testid={`subs-countdown-${dealId}`}>
      <div>{countdownText}</div>
      {showGrace && <div>+{graceDays} day{graceDays !== 1 ? 's' : ''} grace ({chartererTier})</div>}
    </div>
  );
}
