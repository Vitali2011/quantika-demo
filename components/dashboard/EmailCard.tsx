import Link from 'next/link';
import { STATUS_CONFIG } from '@/lib/constants';
import type { StatusGroup, EmailRow } from '@/lib/dashboard-queries';

function StatusBadge({ status }: { status: StatusGroup }) {
  if (status === 'STALE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
        🕳️ Stale
      </span>
    );
  }
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

export function EmailCard({ row, href }: { row: EmailRow; href: string }) {
  const isStale = row.statusGroup === 'STALE';
  const days = row.processed.daysWithoutReply;
  return (
    <Link href={href}>
      <div
        className={`flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 ${isStale ? 'opacity-50' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate text-gray-900">
            {row.email.fromName || row.email.fromEmail || row.email.from}
          </p>
          <p className="text-xs text-gray-500 truncate">{row.email.subject}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <StatusBadge status={row.statusGroup} />
          {days !== null && days > 0 && !isStale && row.processed.status === 'NEEDS_ACTION' && (
            <span className="text-xs text-red-600 font-medium">{days}d</span>
          )}
        </div>
      </div>
    </Link>
  );
}
