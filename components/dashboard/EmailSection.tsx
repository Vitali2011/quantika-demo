import { CATEGORY_LABELS, CATEGORY_COLORS, STATUS_CONFIG } from '@/lib/constants';
import type { EmailCategory } from '@/lib/types';
import { groupEmailsByStatus, STATUS_GROUPS_ORDER } from '@/lib/dashboard-queries';
import type { EmailRow } from '@/lib/dashboard-queries';
import { EmailCard } from './EmailCard';

export function EmailSection({
  category,
  rows,
  totalCount,
}: {
  category: EmailCategory;
  rows: EmailRow[];
  totalCount: number;
}) {
  const grouped = groupEmailsByStatus(rows);
  const colorClass = CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-800';

  return (
    <details className="border border-gray-200 rounded-lg overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer hover:bg-gray-50 list-none">
        <span className="font-medium text-gray-800">
          {CATEGORY_LABELS[category] || category}
        </span>
        <span className={`ml-2 px-2 py-0.5 rounded text-xs font-semibold ${colorClass}`}>
          {totalCount}
        </span>
      </summary>
      <div className="bg-white px-4 pb-4 space-y-4">
        {STATUS_GROUPS_ORDER.map((statusGroup) => {
          const groupRows = grouped[statusGroup];
          if (!groupRows || groupRows.length === 0) return null;
          const isStaleGroup = statusGroup === 'STALE';
          const groupLabel =
            statusGroup === 'STALE'
              ? '🕳️ Stale'
              : `${STATUS_CONFIG[statusGroup]?.emoji || ''} ${STATUS_CONFIG[statusGroup]?.label || statusGroup}`;
          let getHref: (row: EmailRow) => string;
          if (category === 'CARGO_INQUIRY') getHref = (r) => `/cargo/${r.email.id}`;
          else if (category === 'VESSEL_POSITION') getHref = (r) => `/vessel/${r.email.id}`;
          else if (category === 'FIXTURE_RECAP') getHref = (r) => `/fixture/${r.email.id}`;
          else if (category === 'CLIENT_REPLY') getHref = (r) => `/cargo/${r.email.id}`;
          else if (category === 'DOCUMENT') getHref = (r) => `/cargo/${r.email.id}`;
          else getHref = (r) => `/cargo/${r.email.id}`;
          return (
            <div key={statusGroup}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 mt-3 ${isStaleGroup ? 'text-gray-400' : 'text-gray-600'}`}>
                {groupLabel} ({groupRows.length})
              </p>
              <div className="space-y-1">
                {groupRows.map((row) => (
                  <EmailCard key={row.email.id} row={row} href={getHref(row)} />
                ))}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="text-sm text-gray-400 pt-2">No emails in this category.</p>
        )}
      </div>
    </details>
  );
}
