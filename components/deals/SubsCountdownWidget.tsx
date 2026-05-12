/**
 * SubsCountdownWidget (γ-08) — Timezone-aware subs deadline countdown.
 *
 * Shows countdown to subs deadline with charterer grace indicator.
 * Behind NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED flag.
 */

'use client';

import React from 'react';
import { getChartererGraceDays } from '@/lib/deadlines/subs-guardian';

export interface SubsCountdownWidgetProps {
  dealId: string;
  subsDeadline: string; // ISO 8601
  chartererTier?: 'blue-chip' | 'second' | 'weak';
  timezone?: string;
}

export default function SubsCountdownWidget({
  dealId,
  subsDeadline,
  chartererTier,
  timezone = 'UTC',
}: SubsCountdownWidgetProps) {
  // Feature flag check
  if (process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED !== 'true') {
    return null;
  }

  // Parse deadline
  const deadline = new Date(subsDeadline);
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
  const showGrace = chartererTier && getChartererGraceDays(chartererTier) > 0;

  return (
    <div data-testid={`subs-countdown-${dealId}`}>
      <div>{countdownText}</div>
      {showGrace && <div>+1 day grace (blue-chip)</div>}
    </div>
  );
}
