'use client';

/**
 * SubsCountdown — live countdown badge для subs-deadline.
 *
 * Тикает раз в секунду, меняет цвет по стадии (pending=gray …
 * 2h=red, expired=dark-red). Когда стадия = '2h' — показывает
 * CTA «Draft extension request» (β-11 plan-first или mailto fallback).
 */

import { useEffect, useState, type ReactElement } from 'react';
import {
  computeStage,
  type EscalationStage,
} from '@/lib/deadlines/subs-guardian';
import { resolveExtensionCta } from '@/lib/deadlines/cta';

export interface SubsCountdownProps {
  deadlineAt: string;
  dealId: string;
  counterparty: string;
  counterpartyEmail?: string;
  /** Override for tests / SSR. */
  planFirstAvailable?: boolean;
}

const STAGE_COLOR: Record<EscalationStage | 'pending', string> = {
  pending: '#888',
  '24h': '#3b82f6',
  '8h': '#eab308',
  '4h': '#f97316',
  '2h': '#ef4444',
  expired: '#7f1d1d',
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function SubsCountdown(props: SubsCountdownProps): ReactElement {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = new Date(props.deadlineAt).getTime() - now.getTime();
  const stage = computeStage(props.deadlineAt, now);
  const color = STAGE_COLOR[stage];
  const label = stage === 'expired' ? 'SUBS EXPIRED' : `${formatRemaining(remainingMs)} to subs`;

  const showCta = stage === '2h' || stage === 'expired';
  const cta = showCta
    ? resolveExtensionCta({
        dealId: props.dealId,
        counterparty: props.counterparty,
        counterpartyEmail: props.counterpartyEmail,
        deadlineAt: props.deadlineAt,
        planFirstAvailable: props.planFirstAvailable,
      })
    : null;

  return (
    <div data-testid="subs-countdown" data-stage={stage}>
      <span
        style={{
          backgroundColor: color,
          color: '#fff',
          padding: '2px 8px',
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: 13,
        }}
      >
        {label}
      </span>
      {cta && (
        <a
          data-testid="subs-cta"
          data-kind={cta.kind}
          href={cta.href}
          style={{ marginLeft: 8, color: '#ef4444', textDecoration: 'underline' }}
        >
          {cta.label}
        </a>
      )}
    </div>
  );
}

export default SubsCountdown;
