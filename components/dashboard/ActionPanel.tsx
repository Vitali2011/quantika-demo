import Link from 'next/link';
import type { Match, CommissionSummary } from '@/lib/types';
import type { EmailRow } from '@/lib/dashboard-queries';
import { EmailCard } from './EmailCard';

export function ActionPanel({
  needsActionCargo,
  goodMatches,
  fixtureRows,
  commissionSummary,
  commissionLines,
  oldestDays,
}: {
  needsActionCargo: EmailRow[];
  goodMatches: Match[];
  fixtureRows: EmailRow[];
  commissionSummary: CommissionSummary | null;
  commissionLines: string | null;
  oldestDays: number;
}) {
  return (
    <div className="space-y-3">
      {needsActionCargo.length > 0 ? (
        <details className="rounded-lg border bg-red-50 border-red-200 overflow-hidden">
          <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-red-100 list-none">
            <span className="text-2xl">🔴</span>
            <div className="flex-1">
              <p className="font-semibold text-red-800">
                {needsActionCargo.length} {needsActionCargo.length === 1 ? 'inquiry' : 'inquiries'} waiting for your reply
              </p>
              {oldestDays > 0 && (
                <p className="text-sm text-red-600">Oldest: {oldestDays} days without reply · tap to expand</p>
              )}
            </div>
            <span className="shrink-0 text-red-400 text-sm">▼</span>
          </summary>
          <div className="bg-white px-4 pb-4 pt-2 space-y-1">
            {needsActionCargo.map((row) => (
              <EmailCard key={row.email.id} row={row} href={`/cargo/${row.email.id}`} />
            ))}
          </div>
        </details>
      ) : (
        <div className="flex items-center p-4 rounded-lg border bg-white border-gray-200">
          <span className="text-2xl mr-3">🔴</span>
          <p className="font-medium text-gray-600">No unanswered inquiries — all clear</p>
        </div>
      )}

      {goodMatches.length > 0 ? (
        <details className="rounded-lg border bg-blue-50 border-blue-200 overflow-hidden">
          <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-blue-100 list-none">
            <span className="text-2xl">🔗</span>
            <div className="flex-1">
              <p className="font-semibold text-blue-800">
                {goodMatches.length} vessel-cargo {goodMatches.length === 1 ? 'match' : 'matches'} found
              </p>
              <p className="text-sm text-blue-600">tap to expand</p>
            </div>
            <span className="shrink-0 text-blue-400 text-sm">▼</span>
          </summary>
          <div className="bg-white px-4 pb-4 pt-2 space-y-1">
            {goodMatches.map((match, i) => (
              <Link key={i} href={`/match/${i}`}>
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 bg-white">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {match.matchReasons[0] || `Match #${i + 1}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      Level: {match.matchLevel} · {match.matchReasons.length} reasons
                    </p>
                  </div>
                  <span className={`shrink-0 ml-3 px-2 py-0.5 rounded text-xs font-semibold ${match.matchLevel === 'good' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {match.matchLevel}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </details>
      ) : (
        <div className="flex items-center p-4 rounded-lg border bg-white border-gray-200">
          <span className="text-2xl mr-3">🔗</span>
          <p className="font-medium text-gray-500">No vessel-cargo matches found</p>
        </div>
      )}

      {fixtureRows.length > 0 ? (
        <details className="rounded-lg border bg-purple-50 border-purple-200 overflow-hidden">
          <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-purple-100 list-none">
            <span className="text-2xl">📋</span>
            <div className="flex-1">
              <p className="font-semibold text-purple-800">
                {fixtureRows.length} fixture {fixtureRows.length === 1 ? 'recap' : 'recaps'} extracted
              </p>
              <p className="text-sm text-purple-600">tap to expand</p>
            </div>
            <span className="shrink-0 text-purple-400 text-sm">▼</span>
          </summary>
          <div className="bg-white px-4 pb-4 pt-2 space-y-1">
            {fixtureRows.map((row) => (
              <EmailCard key={row.email.id} row={row} href={`/fixture/${row.email.id}`} />
            ))}
          </div>
        </details>
      ) : (
        <div className="flex items-center p-4 rounded-lg border bg-white border-gray-200">
          <span className="text-2xl mr-3">📋</span>
          <p className="font-medium text-gray-500">No fixture recaps found</p>
        </div>
      )}

      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 rounded-lg border ${commissionSummary && commissionSummary.details.length > 0 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <div>
            {commissionSummary && commissionSummary.details.length > 0 ? (
              <p className="font-semibold text-green-800">
                Commission from recaps: {commissionLines}
              </p>
            ) : (
              <p className="font-medium text-gray-500">No commission data from recaps</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
