'use client';
import { cn } from '@/lib/utils';

interface Props {
  from: string;
  subject: string;
  status: 'queue' | 'active' | 'done';
  matchHint?: string;
}

export function LiveStripCard({ from, subject, status, matchHint }: Props) {
  return (
    <div
      className={cn(
        'bg-ds-surface border rounded-ds-sm px-2 py-1.5 text-[10px]',
        status === 'queue' && 'border-orange-200 opacity-60',
        status === 'active' && 'border-amber-400 ring-2 ring-amber-200',
        status === 'done' && 'border-green-300 bg-green-50',
      )}
    >
      <div className="font-semibold text-ds-text truncate">{from}</div>
      <div className="text-ds-text-muted truncate">{subject}</div>
      <div
        className={cn(
          'text-[9px] mt-0.5 uppercase tracking-wide',
          status === 'done' && 'text-green-700 font-semibold',
          status === 'active' && 'text-amber-700 font-semibold',
          status === 'queue' && 'text-ds-text-subtle',
        )}
      >
        {status === 'queue' && 'queue'}
        {status === 'active' && '⋯ processing'}
        {status === 'done' && `✓ ${matchHint ?? 'done'}`}
      </div>
    </div>
  );
}
