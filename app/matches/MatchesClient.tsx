"use client";

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import type { StoredMatch, MatchStatus } from '@/lib/matching/matches-repository';
import { matchesToCsv } from '@/lib/matching/matches-csv';

interface Props {
  initialMatches: StoredMatch[];
  isComputing?: boolean;
}

const ALL_STATUSES: MatchStatus[] = ['shortlist', 'saved', 'dismissed', 'archived'];

const CARGO_TYPE_OPTIONS = ['grain', 'coal', 'ore', 'container', 'project'];

interface ScoreComponent {
  label: string;
  points: number;
  max: number;
  reason: string;
}

export default function MatchesClient({ initialMatches, isComputing = false }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Core state
  const [matches, setMatches] = useState<StoredMatch[]>(initialMatches);
  const [filterStatus, setFilterStatus] = useState<MatchStatus | null>(() => {
    const s = searchParams.get('status');
    return s && (ALL_STATUSES as string[]).includes(s) ? (s as MatchStatus) : null;
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedBreakdown, setExpandedBreakdown] = useState<number | null>(null);
  const [showModal, setShowModal] = useState<{ action: string; count: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'freshness'>('score');

  // Filter panel state — lazy-initialized from URL search params on first render
  const [filtersOpen, setFiltersOpen] = useState(() =>
    searchParams.has('cargo_type') ||
    searchParams.has('route') ||
    searchParams.has('laycan_from') ||
    searchParams.has('laycan_to') ||
    searchParams.has('score_min') ||
    searchParams.has('dwt_min') ||
    searchParams.has('dwt_max')
  );
  const [cargoTypes, setCargoTypes] = useState<string[]>(() =>
    searchParams.getAll('cargo_type').filter(Boolean)
  );
  const [route, setRoute] = useState(() => searchParams.get('route') ?? '');
  const [laycan_from, setLaycanFrom] = useState(() => searchParams.get('laycan_from') ?? '');
  const [laycan_to, setLaycanTo] = useState(() => searchParams.get('laycan_to') ?? '');
  const [score_min, setScoreMin] = useState(() => searchParams.get('score_min') ?? '');
  const [dwt_min, setDwtMin] = useState(() => searchParams.get('dwt_min') ?? '');
  const [dwt_max, setDwtMax] = useState(() => searchParams.get('dwt_max') ?? '');

  // Apply Filters handler
  const handleApplyFilters = useCallback(async () => {
    const params = new URLSearchParams();
    for (const ct of cargoTypes) params.append('cargo_type', ct);
    if (route) params.set('route', route);
    if (laycan_from) params.set('laycan_from', laycan_from);
    if (laycan_to) params.set('laycan_to', laycan_to);
    if (score_min) params.set('score_min', score_min);
    if (dwt_min) params.set('dwt_min', dwt_min);
    if (dwt_max) params.set('dwt_max', dwt_max);
    if (filterStatus) params.set('status', filterStatus);

    const qs = params.toString();
    router.push(qs ? `/matches?${qs}` : '/matches');

    const res = await fetch(qs ? `/api/matches?${qs}` : '/api/matches');
    if (res.ok) {
      const data = await res.json();
      setMatches(data.matches);
    }
  }, [cargoTypes, route, laycan_from, laycan_to, score_min, dwt_min, dwt_max, filterStatus, router]);

  // Clear Filters handler
  const handleClearFilters = useCallback(async () => {
    setCargoTypes([]);
    setRoute('');
    setLaycanFrom('');
    setLaycanTo('');
    setScoreMin('');
    setDwtMin('');
    setDwtMax('');
    setFilterStatus(null);
    router.push('/matches');

    const res = await fetch('/api/matches');
    if (res.ok) {
      const data = await res.json();
      setMatches(data.matches);
    }
  }, [router]);

  // Single match action
  async function handleAction(id: number, status: MatchStatus) {
    const res = await fetch(`/api/matches/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated: StoredMatch = await res.json();
      setMatches((prev) => prev.map((m) => (m.id === id ? updated : m)));
    }
  }

  // Bulk action handler
  async function handleBulkAction(action: string) {
    const ids = Array.from(selectedIds);
    const isDelete = action === 'delete';

    const res = await fetch('/api/matches/bulk', {
      method: isDelete ? 'DELETE' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isDelete ? { ids } : { ids, status: action }),
    });

    if (!res.ok) {
      setBulkError(`Bulk action failed: ${res.status}`);
      return;
    }

    // Refresh matches after successful bulk action
    const refreshRes = await fetch('/api/matches');
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      setMatches(data.matches);
    }

    // Clear selection after successful bulk action
    setSelectedIds(new Set());
    setBulkError(null);
  }

  // Export selected matches as CSV
  function handleExportCsv() {
    const selected = matches.filter((m) => selectedIds.has(m.id));
    const csv = matchesToCsv(selected);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Toggle checkbox selection
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Select all / deselect all visible matches
  function toggleSelectAll() {
    const allSelected = filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((m) => m.id)));
    }
  }

  // Toggle score breakdown expansion
  function toggleBreakdown(id: number) {
    setExpandedBreakdown((prev) => (prev === id ? null : id));
  }

  // Client-side filter: status + cargo_type; then sort by score or freshness
  const filtered = matches
    .filter(
      (m) =>
        (!filterStatus || m.status === filterStatus) &&
        (cargoTypes.length === 0 || cargoTypes.includes(m.cargo_type ?? ''))
    )
    .sort((a, b) =>
      sortBy === 'freshness' ? b.created_at - a.created_at : b.score - a.score
    );

  // Update status filter and persist to URL
  function applyStatusFilter(status: MatchStatus | null) {
    setFilterStatus(status);
    const params = new URLSearchParams(searchParams.toString());
    if (status) {
      params.set('status', status);
    } else {
      params.delete('status');
    }
    const qs = params.toString();
    router.replace(qs ? `/matches?${qs}` : '/matches');
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Status filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => applyStatusFilter(null)}
          className={`px-3 py-2.5 rounded-full text-sm border min-h-[44px] ${!filterStatus ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
          All
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => applyStatusFilter(s)}
            className={`px-3 py-2.5 rounded-full text-sm border capitalize min-h-[44px] ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="px-3 py-2.5 rounded-full text-sm border bg-white text-gray-700 border-gray-300 ml-2 min-h-[44px]"
        >
          Advanced Filters
        </button>
      </div>

      {/* Sort controls (#350) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Sort:</span>
        <button
          onClick={() => setSortBy('score')}
          data-testid="sort-score"
          className={`px-3 py-1.5 rounded text-xs border ${sortBy === 'score' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
          Score
        </button>
        <button
          onClick={() => setSortBy('freshness')}
          data-testid="sort-freshness"
          className={`px-3 py-1.5 rounded text-xs border ${sortBy === 'freshness' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
          Freshness
        </button>
      </div>

      {/* Advanced Filter Panel */}
      {filtersOpen && (
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold text-sm text-gray-700">Filters</h3>

          {/* Cargo type checkboxes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cargo Type</label>
            <div className="flex flex-wrap gap-3">
              {CARGO_TYPE_OPTIONS.map((ct) => (
                <label key={ct} className="flex items-center gap-1 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={cargoTypes.includes(ct)}
                    onChange={() => {
                      setCargoTypes((prev) =>
                        prev.includes(ct) ? prev.filter((x) => x !== ct) : [...prev, ct]
                      );
                    }}
                  />
                  {ct}
                </label>
              ))}
            </div>
          </div>

          {/* Route (Port / UNLOCODE) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Route (Port / UNLOCODE)</label>
            <input
              type="text"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder="e.g. UAODS or Port Name"
              className="border rounded px-2 py-1 text-sm w-full"
            />
          </div>

          {/* Laycan range */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Laycan From</label>
              <input
                type="date"
                value={laycan_from}
                onChange={(e) => setLaycanFrom(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-full"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Laycan To</label>
              <input
                type="date"
                value={laycan_to}
                onChange={(e) => setLaycanTo(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-full"
              />
            </div>
          </div>

          {/* Score min */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Min Score</label>
            <input
              type="number"
              value={score_min}
              onChange={(e) => setScoreMin(e.target.value)}
              placeholder="0"
              min={0}
              max={100}
              className="border rounded px-2 py-1 text-sm w-32"
            />
          </div>

          {/* DWT range */}
          <div className="flex gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DWT Min</label>
              <input
                type="number"
                value={dwt_min}
                onChange={(e) => setDwtMin(e.target.value)}
                placeholder="0"
                min={0}
                className="border rounded px-2 py-1 text-sm w-32"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DWT Max</label>
              <input
                type="number"
                value={dwt_max}
                onChange={(e) => setDwtMax(e.target.value)}
                placeholder="unlimited"
                min={0}
                className="border rounded px-2 py-1 text-sm w-32"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleApplyFilters}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Apply
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Match list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center space-y-2">
          {isComputing ? (
            <>
              <p className="text-gray-700 font-medium" data-testid="computing-state">
                Processing your enquiries…
              </p>
              <p className="text-sm text-gray-500">
                Matches are being computed in the background. Refresh in a moment.
              </p>
            </>
          ) : (
            <p className="text-gray-500">No matches yet</p>
          )}
        </div>
      ) : (
        <>
          {/* Select all header */}
          <div className="flex items-center gap-2 px-1 py-1">
            <input
              type="checkbox"
              className="w-4 h-4 cursor-pointer"
              checked={filtered.every((m) => selectedIds.has(m.id))}
              onChange={toggleSelectAll}
            />
            <span className="text-xs text-gray-500 select-none">
              Select all ({filtered.length})
            </span>
          </div>

          <ul className="space-y-4">
            {filtered.map((match) => (
              <li key={match.id} className="bg-white rounded-lg border overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  {/* Checkbox for bulk selection */}
                  <div className="pt-1 flex-none">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(match.id)}
                      onChange={() => toggleSelect(match.id)}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Clickable card info — wrapped in Link (#348) */}
                    <Link href={`/match/${match.id}`} className="block">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">
                            Cargo: <span className="text-gray-700">{match.cargo_id}</span>
                          </div>
                          <div className="font-medium text-sm">
                            Vessel: <span className="text-gray-700">{match.vessel_id}</span>
                          </div>
                          {match.cargo_type && (
                            <span className="inline-block text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded mt-0.5">
                              {match.cargo_type}
                            </span>
                          )}
                          {(match.load_port || match.discharge_port) && (
                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                              {[match.load_port, match.discharge_port].filter(Boolean).join(' → ')}
                            </div>
                          )}
                          {match.vessel_dwt && (
                            <div className="text-xs text-gray-500">
                              DWT: {match.vessel_dwt.toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-none">
                          <div className="text-lg font-bold text-blue-600">{match.score}%</div>
                          <div className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                            {match.status}
                          </div>
                        </div>
                      </div>

                      {match.reason && (
                        <div className="text-xs text-gray-500 truncate mt-1">
                          {match.reason}
                        </div>
                      )}

                      {/* Vague-region hint (Phase E3) */}
                      {match.reason_structured && (() => {
                        let vagueRegionAdjustment: number | undefined;
                        try {
                          const parsed = JSON.parse(match.reason_structured as string);
                          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            vagueRegionAdjustment = parsed.vagueRegionAdjustment;
                          }
                        } catch {
                          vagueRegionAdjustment = undefined;
                        }
                        if (typeof vagueRegionAdjustment === 'number' && vagueRegionAdjustment < 0) {
                          let hintText = '⚠ Vague location — ask for specific anchorage / load port';
                          try {
                            const parsed = JSON.parse(match.reason_structured as string);
                            const components: ScoreComponent[] = Array.isArray(parsed)
                              ? parsed
                              : (Array.isArray(parsed.components) ? parsed.components : []);
                            const geoComp = components.find((c) => c.label === 'Geographic proximity');
                            if (geoComp?.reason?.includes('vessel position')) {
                              hintText = '⚠ Vessel position vague — ask for specific anchorage';
                            } else if (geoComp?.reason?.includes('cargo origin')) {
                              hintText = '⚠ Cargo origin vague — ask for specific load port';
                            }
                          } catch {
                            // use generic hint
                          }
                          return (
                            <div
                              role="status"
                              className="mt-1 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1"
                            >
                              {hintText}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </Link>

                    {/* Score Breakdown toggle — outside Link to avoid nested button-in-anchor */}
                    {match.reason_structured && (
                      <button
                        onClick={() => toggleBreakdown(match.id)}
                        className="text-xs text-blue-600 hover:underline mt-1"
                      >
                        {expandedBreakdown === match.id ? 'Hide Breakdown' : 'Show Breakdown'}
                      </button>
                    )}

                    {/* Score Breakdown panel */}
                    {expandedBreakdown === match.id && match.reason_structured && (() => {
                      let components: ScoreComponent[] = [];
                      try {
                        const parsed = JSON.parse(match.reason_structured as string);
                        components = Array.isArray(parsed)
                          ? parsed
                          : (Array.isArray(parsed.components) ? parsed.components : []);
                      } catch {
                        components = [];
                      }
                      return (
                        <div className="mt-2 space-y-2 border-t pt-2">
                          <h4 className="text-xs font-semibold text-gray-600">Score Breakdown</h4>
                          {components.map((comp, idx) => (
                            <div key={idx} className="space-y-0.5">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium">{comp.label}</span>
                                <span>{comp.points} / {comp.max} points</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="bg-blue-500 h-1.5 rounded-full"
                                  style={{ width: `${((comp.points / comp.max) * 100).toFixed(0)}%` }}
                                />
                              </div>
                              {comp.reason && (
                                <p className="text-xs text-gray-500">{comp.reason}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {match.status !== 'saved' && match.status !== 'archived' && (
                        <button
                          onClick={() => handleAction(match.id, 'saved')}
                          className="px-3 py-3 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 min-h-[44px]"
                        >
                          Save
                        </button>
                      )}
                      {match.status !== 'dismissed' && match.status !== 'archived' && (
                        <button
                          onClick={() => handleAction(match.id, 'dismissed')}
                          className="px-3 py-3 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 min-h-[44px]"
                        >
                          Dismiss
                        </button>
                      )}
                      {match.status !== 'archived' && (
                        <button
                          onClick={() => handleAction(match.id, 'archived')}
                          className="px-3 py-3 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 min-h-[44px]"
                        >
                          Archive
                        </button>
                      )}
                      {match.status === 'archived' && (
                        <button
                          onClick={() => handleAction(match.id, 'saved')}
                          className="px-3 py-3 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200 min-h-[44px]"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Sticky footer for bulk actions (#374) */}
      {selectedIds.size > 0 && (
        <div
          data-testid="bulk-toolbar"
          className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-4 py-3 pb-[calc(56px+env(safe-area-inset-bottom,0px))] flex items-center gap-3 z-50 sticky-bulk-footer"
        >
          <span className="text-sm font-medium text-gray-700">
            Selected {selectedIds.size} {selectedIds.size === 1 ? 'match' : 'matches'}
          </span>
          {bulkError && (
            <span className="text-xs text-red-600">{bulkError}</span>
          )}
          <div className="flex gap-2 ml-auto flex-wrap">
            <button
              onClick={handleExportCsv}
              className="px-3 py-3 text-sm rounded bg-blue-100 text-blue-700 hover:bg-blue-200 min-h-[44px]"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleBulkAction('saved')}
              className="px-3 py-3 text-sm rounded bg-green-100 text-green-700 hover:bg-green-200 min-h-[44px]"
            >
              Save All
            </button>
            <button
              onClick={() => handleBulkAction('dismissed')}
              className="px-3 py-3 text-sm rounded bg-red-100 text-red-700 hover:bg-red-200 min-h-[44px]"
            >
              Dismiss All
            </button>
            <button
              onClick={() => {
                if (selectedIds.size > 5) {
                  setShowModal({ action: 'archived', count: selectedIds.size });
                } else {
                  handleBulkAction('archived');
                }
              }}
              className="px-3 py-3 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200 min-h-[44px]"
            >
              Archive All
            </button>
            <button
              onClick={() => setShowModal({ action: 'delete', count: selectedIds.size })}
              className="px-3 py-3 text-sm rounded bg-red-600 text-white hover:bg-red-700 min-h-[44px]"
            >
              Delete (admin)
            </button>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {showModal && (
        <div className="modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Confirm Action</h3>
            <p className="text-sm text-gray-700 mb-4">
              Are you sure? This will {showModal.action} {showModal.count} matches.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(null)}
                className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleBulkAction(showModal.action);
                  setShowModal(null);
                }}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
