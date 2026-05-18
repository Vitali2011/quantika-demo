"use client";

import { useState } from 'react';
import type { StoredMatch, MatchStatus } from '@/lib/matching/matches-repository';

interface Props {
  initialMatches: StoredMatch[];
}

const ALL_STATUSES: MatchStatus[] = ['shortlist', 'saved', 'dismissed', 'archived'];

export default function MatchesClient({ initialMatches }: Props) {
  const [matches, setMatches] = useState<StoredMatch[]>(initialMatches);
  const [filterStatus, setFilterStatus] = useState<MatchStatus | null>(null);

  const filtered = matches.filter(
    (m) => !filterStatus || m.status === filterStatus
  );

  async function handleAction(id: number, status: MatchStatus) {
    const res = await fetch(`/api/matches/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated: StoredMatch = await res.json();
      setMatches((prev) =>
        prev.map((m) => (m.id === id ? updated : m))
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Status filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatus(null)}
          className={`px-3 py-1 rounded-full text-sm border ${!filterStatus ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
          All
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-sm border capitalize ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Match list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center">
          <p className="text-gray-500">No matches yet</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((match) => (
            <li key={match.id} className="bg-white rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">
                    Cargo: <span className="text-gray-700">{match.cargo_id}</span>
                  </div>
                  <div className="font-medium text-sm">
                    Vessel: <span className="text-gray-700">{match.vessel_id}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-blue-600">{match.score}%</div>
                  <div className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                    {match.status}
                  </div>
                </div>
              </div>
              {match.reason && (
                <div className="text-xs text-gray-500 truncate">
                  {match.reason}
                </div>
              )}
              {/* Action buttons */}
              <div className="flex gap-2">
                {match.status !== 'saved' && match.status !== 'archived' && (
                  <button
                    onClick={() => handleAction(match.id, 'saved')}
                    className="px-3 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200"
                  >
                    Save
                  </button>
                )}
                {match.status !== 'dismissed' && match.status !== 'archived' && (
                  <button
                    onClick={() => handleAction(match.id, 'dismissed')}
                    className="px-3 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200"
                  >
                    Dismiss
                  </button>
                )}
                {match.status !== 'archived' && (
                  <button
                    onClick={() => handleAction(match.id, 'archived')}
                    className="px-3 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                  >
                    Archive
                  </button>
                )}
                {match.status === 'archived' && (
                  <button
                    onClick={() => handleAction(match.id, 'saved')}
                    className="px-3 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                  >
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
