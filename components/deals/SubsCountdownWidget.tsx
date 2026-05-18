/**
 * SubsCountdownWidget (γ-08) — Timezone-aware subs deadline countdown.
 *
 * Shows countdown to subs deadline with charterer grace indicator.
 * Behind NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED flag.
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getChartererGraceDays, normalizeDeadline } from '@/lib/deadlines/subs-guardian';

export interface SubsCountdownWidgetProps {
  dealId: string;
  subsDeadline: string | number; // ISO 8601 or Unix seconds/ms
  chartererTier?: 'blue-chip' | 'second' | 'weak';
}

function computeRemaining(subsDeadline: string | number): number {
  const deadline = normalizeDeadline(subsDeadline);
  return deadline.getTime() - Date.now();
}

// Inner component holds hooks; only mounted when flag is enabled.
function SubsCountdownInner({
  dealId,
  subsDeadline,
  chartererTier,
}: SubsCountdownWidgetProps) {
  const [tick, setTick] = useState(0);
  // tick is intentional: computeRemaining calls Date.now() internally, which is not a
  // React dep but must re-run every interval. tick forces that recomputation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const remaining = useMemo(() => computeRemaining(subsDeadline), [subsDeadline, tick]);

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, [subsDeadline]);

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
