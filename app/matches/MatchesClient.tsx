"use client";

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import type { StoredMatch, MatchStatus } from '@/lib/matching/matches-repository';
import { matchesToCsv } from '@/lib/matching/matches-csv';
import { LiveStrip } from '@/design-system/patterns/LiveStrip';
import { MatchToast } from '@/design-system/patterns/MatchToast';
import { useLiveJobs } from '@/design-system/patterns/useLiveJobs';
import { useMode } from '@/design-system/patterns/useMode';
import { filterMatchesByMode } from '@/lib/matching/mode-filter';
import { useToast } from '@/components/ui/toast';
import { fmtLaycan, isLaycanExpired } from '@/lib/utils/fmt-laycan';
import { freightBadge, FREIGHT_BADGE_CLASSES } from '@/lib/matching/freight-badge';
import { useDemoNow } from '@/lib/clock-client';

interface Props {
  initialMatches: StoredMatch[];
  isComputing?: boolean;
  cargoEmailIds?: string[];
  vesselEmailIds?: string[];
  /** "Manual review" bucket (weak score / idle large gap), read-only. Wave B. */
  lowConfidenceMatches?: StoredMatch[];
  /** "Not enough data" bucket (unknown verdict), read-only. Wave B. */
  insufficientData?: StoredMatch[];
}

const ALL_STATUSES: MatchStatus[] = ['shortlist', 'saved', 'dismissed', 'archived'];
const CARGO_TYPE_OPTIONS = ['grain', 'coal', 'ore', 'container', 'project'];

interface ScoreComponent {
  label: string;
  points: number;
  max: number;
  reason: string;
}

type QuickFilter = 'all' | 'fresh' | 'score80' | 'dwt50_60';
type SortBy = 'fit' | 'score' | 'freshness' | 'tce';
type Density = 'table' | 'cards';
type Tab = 'matches' | 'review' | 'insufficient';

const SORT_LABELS: Record<SortBy, string> = { fit: 'Fit %', score: 'Score', freshness: 'Freshness', tce: 'TCE/day' };

function scoreClass(score: number): string {
  if (score >= 93) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (score >= 83) return 'bg-amber-50 text-amber-800 border border-amber-200';
  return 'bg-slate-100 text-slate-500 border border-slate-200';
}

function fitClass(pct: number): string {
  if (pct >= 85) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (pct >= 60) return 'bg-amber-50 text-amber-800 border border-amber-200';
  return 'bg-slate-100 text-slate-500 border border-slate-200';
}

function vesselInitials(vid: string): string {
  const parts = vid.split(/[\s_\-]+/);
  const a = parts[0]?.[0]?.toUpperCase() ?? '';
  const b = parts[1]?.[0]?.toUpperCase() ?? '';
  return (a + b).slice(0, 2);
}

function formatAge(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return 'now';
  if (diff < 86400) return new Date(ts * 1000).toTimeString().slice(0, 5);
  return new Date(ts * 1000).toLocaleDateString('en-US', { weekday: 'short' });
}

// Defer Date.now() to post-mount: SSR and first client paint must produce
// identical HTML, otherwise React #418 hydration mismatch fires when a match
// sits near the 2-hour boundary (same fix pattern as SubsCountdown).
function isFreshMatch(m: StoredMatch, now: number): boolean {
  if (now === 0) return false; // pre-mount sentinel → no fresh badge in SSR
  if (isLaycanExpired(m.laycan_end, m.laycan_start, now)) return false;
  return now - m.created_at < 7200000;
}

// Display score is capped at 70 for expired laycans — the stored score reflects
// conditions at match-creation time, but once the cargo window has passed the
// match is no longer actionable at the original confidence level.
function effectiveScore(m: StoredMatch, nowMs: number): number {
  if (nowMs === 0) return m.score;
  if (isLaycanExpired(m.laycan_end, m.laycan_start, nowMs)) {
    return Math.min(m.score, 70);
  }
  return m.score;
}

function fmtDwt(v: number | null): string {
  if (v == null) return '—';
  return Math.round(v / 1000) + 'k';
}

function fmtTce(v: number | null): string {
  if (v == null) return '—';
  return '$' + (v / 1000).toFixed(1) + 'k';
}


export default function MatchesClient({ initialMatches, isComputing = false, cargoEmailIds = [], vesselEmailIds = [], lowConfidenceMatches = [], insufficientData = [] }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isOwner } = useMode();
  const toast = useToast();

  // Core state
  const [matches, setMatches] = useState<StoredMatch[]>(initialMatches);

  // Live SSE state (additive — does not touch cached-list flow)
  const { jobs, latestMatch, dismissMatch } = useLiveJobs();

  // Refetch matches when a new match arrives via SSE
  useEffect(() => {
    if (!latestMatch) return;
    fetch('/api/matches').then((res) => {
      if (res.ok) res.json().then((data) => setMatches(data.matches));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestMatch?.match_id]);
  const [filterStatus, setFilterStatus] = useState<MatchStatus | null>(() => {
    const s = searchParams.get('status');
    return s && (ALL_STATUSES as string[]).includes(s) ? (s as MatchStatus) : null;
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedBreakdown, setExpandedBreakdown] = useState<number | null>(null);
  const [expandedFitBreakdown, setExpandedFitBreakdown] = useState<number | null>(null);
  const [showModal, setShowModal] = useState<{ action: string; count: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>(() => isOwner ? 'tce' : 'fit');
  // Derived-state-during-render resets sort on mode switch without cascading renders.
  const [prevIsOwner, setPrevIsOwner] = useState(isOwner);
  if (prevIsOwner !== isOwner) {
    setPrevIsOwner(isOwner);
    setSortBy(isOwner ? 'tce' : 'fit');
  }

  // CD design state
  const [density, setDensity] = useState<Density>('table');
  // Hydration-safe demo clock: 0 on SSR, frozen demo timestamp after mount
  // (or real Date.now() in non-demo mode). Avoids React #418 hydration mismatch.
  const clientNow = useDemoNow();
  const nowUtc = clientNow === 0
    ? ""
    : (() => {
        const d = new Date(clientNow);
        return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      })();
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  // Bucket tabs (Wave B): main matches vs the two read-only realism buckets.
  const [activeTab, setActiveTab] = useState<Tab>('matches');

  // Auto-switch to cards on mobile after mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount detection
      setDensity('cards');
    }
  }, []);

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
      if (status === 'saved') toast.success('Match saved');
      else if (status === 'dismissed') toast.info('Match dismissed');
      else if (status === 'archived') toast.info('Match archived');
    } else {
      toast.error('Action failed — please try again');
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

  // Toggle fit breakdown expansion
  function toggleFitBreakdown(id: number) {
    setExpandedFitBreakdown((prev) => (prev === id ? null : id));
  }

  // Mode-based count for "All" chip: charterer sees cargo-side, owner sees vessel-side
  const modeFiltered = filterMatchesByMode(matches, isOwner, cargoEmailIds, vesselEmailIds);
  const floorFilteredCount = modeFiltered.filter((m) => (m.fit_percent ?? 0) >= 60).length;

  // All-chip count: mode + status + advanced filters (excluding quick-filter so the badge
  // reflects "how many match your current advanced criteria" regardless of quick-filter tab)
  const allChipCount = modeFiltered.filter(
    (m) =>
      (!filterStatus || m.status === filterStatus) &&
      (cargoTypes.length === 0 || cargoTypes.includes(m.cargo_type ?? ''))
  ).length;

  // Client-side filter: mode + status + cargo_type + fit floor + quick filter; then sort
  const filtered = matches
    .filter(
      (m) =>
        // mode filter: charterer sees cargo-side matches, owner sees vessel-side
        (isOwner
          ? vesselEmailIds.length === 0 || vesselEmailIds.includes(m.vessel_id)
          : cargoEmailIds.length === 0 || cargoEmailIds.includes(m.cargo_id)) &&
        // render-side fit floor: hide sub-60% fit matches (#789)
        (m.fit_percent == null || m.fit_percent >= 60) &&
        (!filterStatus || m.status === filterStatus) &&
        (cargoTypes.length === 0 || cargoTypes.includes(m.cargo_type ?? '')) &&
        (quickFilter === 'all' ||
          (quickFilter === 'fresh' && isFreshMatch(m, clientNow)) ||
          (quickFilter === 'score80' && effectiveScore(m, clientNow) >= 80) ||
          (quickFilter === 'dwt50_60' && m.vessel_dwt != null && m.vessel_dwt >= 50000 && m.vessel_dwt <= 60000))
    )
    .sort((a, b) => {
      if (sortBy === 'freshness') return b.created_at - a.created_at;
      if (sortBy === 'tce') return (b.tce_usd_per_day ?? 0) - (a.tce_usd_per_day ?? 0);
      if (sortBy === 'fit') return (b.fit_percent ?? 0) - (a.fit_percent ?? 0);
      return b.score - a.score;
    });

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
    <>
      <LiveStrip jobs={jobs} />
      <div className="space-y-4">

        {nowUtc && (
          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground">AUTO-REFRESH · {nowUtc} UTC</span>
          </div>
        )}

        {/* ===== BUCKET TABS (Wave B) — main list + two read-only realism buckets ===== */}
        <div className="flex items-center gap-1 border-b border-ds-border" role="tablist" aria-label="Match buckets">
          {([
            { id: 'matches' as Tab, label: 'Matches', count: floorFilteredCount, testid: 'tab-matches' },
            // Review / Insufficient buckets hidden from the board (founder 2026-06-02):
            // surface only the ironclad main matches. Buckets stay in DB, not shown.
          ]).map(({ id, label, count, testid }) => (
            <button
              key={id}
              role="tab"
              data-testid={testid}
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`relative -mb-px px-4 py-2.5 text-sm border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label} <span className="font-mono text-xs text-gray-400">({count})</span>
            </button>
          ))}
        </div>

        {/* ===== READ-ONLY BUCKET LIST (review / insufficient tabs) ===== */}
        {activeTab !== 'matches' && (() => {
          const bucketRows = activeTab === 'review' ? lowConfidenceMatches : insufficientData;
          const emptyText = activeTab === 'review'
            ? 'Нет пар на проверку'
            : 'Нет пар с недостатком данных';
          if (bucketRows.length === 0) {
            return (
              <div className="bg-white rounded-lg border p-8 text-center">
                <p className="text-gray-500">{emptyText}</p>
              </div>
            );
          }
          return (
            <ul className="space-y-4" data-testid="bucket-list">
              {bucketRows.map((match) => (
                // Composite key: a cargo↔vessel pair is unique within a bucket, and only
                // one bucket renders per tab — so this never collides with the other bucket's
                // synthetic ids regardless of row counts.
                <li key={`${match.cargo_id}|${match.vessel_id}`} className="bg-white rounded-lg border overflow-hidden">
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex-1 min-w-0">
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
                              DWT: {match.vessel_dwt.toLocaleString('en-US')}
                            </div>
                          )}
                          {match.tce_usd_per_day != null && (
                            <div className="text-xs font-medium text-emerald-700">
                              TCE: ${match.tce_usd_per_day.toLocaleString('en-US')}/day
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
                        <div className="text-xs text-gray-500 truncate mt-1">{match.reason}</div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          );
        })()}

        {/* ===== MAIN MATCH TAB (filters + list) ===== */}
        {activeTab === 'matches' && (<>

        {/* ===== PRIMARY FILTER BAR (CD design) ===== */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Quick filter chips */}
          <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Filter">
            {([
              { id: 'all' as QuickFilter, label: 'All', count: allChipCount },
              { id: 'fresh' as QuickFilter, label: 'Fresh', count: undefined },
              { id: 'score80' as QuickFilter, label: 'Score 80+', count: undefined },
              { id: 'dwt50_60' as QuickFilter, label: 'DWT 50–60k', count: undefined },
            ]).map(({ id, label, count }) => (
              <button
                key={id}
                role="tab"
                aria-selected={quickFilter === id}
                onClick={() => setQuickFilter(id)}
                className={`inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full text-[13px] border transition-all ${
                  quickFilter === id
                    ? 'bg-ds-accent text-white border-ds-accent font-medium'
                    : 'bg-ds-surface text-ds-text border-ds-border hover:border-ds-border-strong'
                }`}
              >
                {label}
                {count != null && (
                  <span className={`font-mono text-[11.5px] px-1.5 py-px rounded-full leading-[1.4] ${
                    quickFilter === id ? 'bg-amber-400/20 text-amber-400' : 'bg-slate-100 text-ds-text-muted'
                  }`}>{count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Sort + Density (right side) */}
          <div className="flex items-center gap-3">
            {/* Sort dropdown (select) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-ds-text-muted">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="h-8 px-2 border border-ds-border rounded-lg bg-ds-surface text-ds-text text-xs font-mono cursor-pointer hover:border-ds-border-strong transition-colors"
              >
                <option data-testid="sort-fit" value="fit">Fit %</option>
                <option data-testid="sort-score" value="score">Score</option>
                <option data-testid="sort-freshness" value="freshness">Freshness</option>
                <option data-testid="sort-tce" value="tce">TCE/day</option>
              </select>
            </div>

            {/* Density toggle: Cards / Table */}
            <div className="inline-flex p-[3px] bg-slate-100/60 rounded-lg" role="tablist" aria-label="View density">
              <button
                role="tab"
                aria-selected={density === 'cards'}
                onClick={() => setDensity('cards')}
                className={`h-[26px] px-3 rounded-md text-xs font-mono transition-all ${density === 'cards' ? 'bg-white text-ds-text shadow-sm' : 'text-ds-text-muted'}`}
              >Cards</button>
              <button
                role="tab"
                aria-selected={density === 'table'}
                onClick={() => setDensity('table')}
                className={`h-[26px] px-3 rounded-md text-xs font-mono transition-all ${density === 'table' ? 'bg-white text-ds-text shadow-sm' : 'text-ds-text-muted'}`}
              >Table</button>
            </div>
          </div>
        </div>

        {/* ===== STATUS FILTER CHIPS + ADVANCED FILTERS TOGGLE ===== */}
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
                  lang="en"
                  value={laycan_from}
                  onChange={(e) => setLaycanFrom(e.target.value)}
                  className="border rounded px-2 py-1 text-sm w-full"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Laycan To</label>
                <input
                  type="date"
                  lang="en"
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

        {/* ===== MATCH LIST ===== */}
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
        ) : density === 'cards' ? (
          /* ===== CARDS VIEW ===== */
          <div className="overflow-x-hidden">
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
                              Cargo: <span className="text-gray-700">{match.cargo_ref ?? match.cargo_id}</span>
                            </div>
                            <div className="font-medium text-sm">
                              Vessel: <span className="text-gray-700">{match.vessel_name ?? 'TBN'}</span>
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
                                DWT: {match.vessel_dwt.toLocaleString('en-US')}
                              </div>
                            )}
                            {match.distance_nm != null && (
                              <div className="text-xs text-gray-500">
                                Distance: {match.distance_nm.toLocaleString('en-US')} nm
                              </div>
                            )}
                            {match.tce_usd_per_day != null && (() => {
                              const badge = freightBadge(match.freight_rate_source);
                              return (
                                <div className={`text-xs font-medium flex items-center gap-1 ${badge.dimmed ? 'text-gray-400' : 'text-emerald-700'}`}>
                                  TCE: ${match.tce_usd_per_day.toLocaleString('en-US')}/day
                                  <span className={`text-xs px-1 rounded ${FREIGHT_BADGE_CLASSES[badge.tone]}`} title={badge.title}>{badge.label}</span>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="text-right flex-none">
                            {match.fit_percent != null ? (
                              <div className={`inline-flex items-center justify-center h-[32px] px-3 rounded-full font-mono text-sm font-semibold mb-0.5 ${fitClass(match.fit_percent)}`}>
                                {Math.round(match.fit_percent)}% fit
                              </div>
                            ) : (
                              <div className="text-lg font-bold text-blue-600">{effectiveScore(match, clientNow)}%</div>
                            )}
                            {match.fit_percent != null && (
                              <div className="text-xs text-gray-400 font-mono">score {effectiveScore(match, clientNow)}</div>
                            )}
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

                      {/* Fit Breakdown toggle — outside Link to avoid nested button-in-anchor */}
                      {match.fit_breakdown && (
                        <button
                          data-testid="fit-breakdown-toggle"
                          onClick={() => toggleFitBreakdown(match.id)}
                          className="text-xs text-emerald-600 hover:underline mt-1 mr-3"
                        >
                          {expandedFitBreakdown === match.id ? 'Hide Fit Breakdown' : 'Show Fit Breakdown'}
                        </button>
                      )}

                      {/* Score Breakdown toggle — outside Link to avoid nested button-in-anchor */}
                      {match.reason_structured && (
                        <button
                          onClick={() => toggleBreakdown(match.id)}
                          className="text-xs text-blue-600 hover:underline mt-1"
                        >
                          {expandedBreakdown === match.id ? 'Hide Breakdown' : 'Show Breakdown'}
                        </button>
                      )}

                      {/* Fit Breakdown panel */}
                      {expandedFitBreakdown === match.id && match.fit_breakdown && (() => {
                        let fb: { components: Array<{ factor: string; label: string; weight: number; score: number; rationale: string }> } | null = null;
                        try { fb = JSON.parse(match.fit_breakdown as string); } catch { fb = null; }
                        if (!fb || !Array.isArray(fb.components)) return null;
                        return (
                          <div className="mt-2 space-y-2 border-t pt-2">
                            <h4 className="text-xs font-semibold text-emerald-700">Fit Breakdown</h4>
                            {fb.components.map((c, idx) => (
                              <div key={idx} className="space-y-0.5">
                                <div className="flex justify-between text-xs">
                                  <span className="font-medium">{c.label}</span>
                                  <span className={`font-mono ${Math.round(c.score / c.weight * 100) >= 60 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                    {Math.round(c.score / c.weight * 100)}%
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full ${Math.round(c.score / c.weight * 100) >= 60 ? 'bg-emerald-500' : 'bg-slate-400'}`}
                                    style={{ width: `${Math.round(c.score / c.weight * 100)}%` }}
                                  />
                                </div>
                                {c.rationale && (
                                  <p className="text-xs text-gray-500">{c.rationale}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}

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
          </div>
        ) : (
          /* ===== TABLE VIEW ===== */
          <section className="bg-ds-surface border border-ds-border rounded-[14px] overflow-hidden" aria-label="Matches table">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed', minWidth: '970px' }}>
                <colgroup>
                  <col style={{ width: '96px' }} />
                  <col style={{ width: '178px' }} />
                  <col style={{ width: '168px' }} />
                  <col style={{ width: '88px' }} />
                  <col style={{ width: '108px' }} />
                  <col style={{ width: '168px' }} />
                  <col style={{ width: '88px' }} />
                  <col style={{ width: '76px' }} />
                </colgroup>
                <thead>
                  <tr className="bg-ds-surface-muted border-b border-ds-border">
                    {(isOwner
                      ? ['Score', 'Cargo', 'Route', 'DWT', 'TCE / day', 'Vessel', 'Laycan', '']
                      : ['Score', 'Vessel', 'Route', 'DWT', 'TCE / day', 'Cargo', 'Laycan', '']
                    ).map((h, i) => (
                      <th
                        key={i}
                        className={`font-mono text-[10.5px] tracking-[0.14em] uppercase text-ds-text-muted font-medium py-[14px] px-3 whitespace-nowrap ${i === 0 ? 'text-left pl-5' : i === 3 || i === 4 || i === 6 ? 'text-right' : 'text-left'} ${i === 7 ? 'pr-5' : ''}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((match) => {
                    const fresh = isFreshMatch(match, clientNow);
                    return (
                      <tr
                        key={match.id}
                        onClick={() => router.push(`/match/${match.id}`)}
                        className={`cursor-pointer transition-colors border-b border-ds-border/40 last:border-b-0 ${fresh ? 'hover:bg-emerald-500/[0.11]' : 'hover:bg-ds-surface-muted'}`}
                        style={fresh ? { background: 'rgba(22,163,74,0.07)' } : undefined}
                      >
                        {/* Score / Fit */}
                        <td className={`py-[13px] px-3 pl-5 align-middle${fresh ? ' [box-shadow:inset_3px_0_0_#16a34a]' : ''}`}>
                          <div className="flex items-center gap-2">
                            {match.fit_percent != null ? (
                              <span className={`inline-flex items-center justify-center h-[26px] px-[11px] rounded-full font-mono text-[12.5px] font-medium ${fitClass(match.fit_percent)}`}>
                                {Math.round(match.fit_percent)}%
                              </span>
                            ) : (
                              <span className={`inline-flex items-center justify-center h-[26px] px-[11px] rounded-full font-mono text-[12.5px] font-medium ${scoreClass(effectiveScore(match, clientNow))}`}>
                                {effectiveScore(match, clientNow)}
                              </span>
                            )}
                            {fresh && (
                              <span className="inline-flex items-center h-[18px] px-[7px] rounded-full font-mono text-[9.5px] tracking-[0.08em] uppercase bg-emerald-600 text-white font-semibold">
                                fresh
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Column 2: Vessel (charterer) or Cargo (owner) */}
                        {isOwner ? (
                          <td className="py-[13px] px-3 align-middle">
                            <span className={`font-mono text-[13px] whitespace-nowrap ${match.cargo_type ? '' : 'text-slate-300'}`}>
                              {match.cargo_type ?? '—'}
                            </span>
                          </td>
                        ) : (
                          <td className="py-[13px] px-3 align-middle">
                            <div className="flex items-center gap-[10px]">
                              <span className="w-7 h-7 rounded-[7px] bg-ds-accent text-ds-accent-fg flex-shrink-0 inline-flex items-center justify-center font-mono text-[11.5px] font-medium">
                                {vesselInitials(match.vessel_name ?? 'TBN')}
                              </span>
                              <span className="font-medium text-sm tracking-[-0.005em] break-words">{match.vessel_name ?? 'TBN'}</span>
                            </div>
                          </td>
                        )}
                        {/* Route */}
                        <td className="py-[13px] px-3 align-middle">
                          {(match.load_port || match.discharge_port) ? (
                            <span
                              className="font-mono text-[13px] flex items-center gap-1 overflow-hidden"
                              title={[match.load_port, match.discharge_port].filter(Boolean).join(' → ')}
                            >
                              {match.load_port && <span className="truncate min-w-0">{match.load_port}</span>}
                              {match.load_port && match.discharge_port && <span className="text-slate-300 flex-shrink-0">→</span>}
                              {match.discharge_port && <span className="truncate min-w-0">{match.discharge_port}</span>}
                            </span>
                          ) : (
                            <span className="font-mono text-slate-300">—</span>
                          )}
                        </td>
                        {/* DWT */}
                        <td className="py-[13px] px-3 text-right align-middle">
                          <span className={`font-mono tabular-nums text-[13.5px] whitespace-nowrap ${match.vessel_dwt ? 'font-medium' : 'text-slate-300'}`}>
                            {fmtDwt(match.vessel_dwt)}
                          </span>
                        </td>
                        {/* TCE */}
                        <td className="py-[13px] px-3 text-right align-middle">
                          <span className={`font-mono tabular-nums text-[13.5px] whitespace-nowrap ${match.tce_usd_per_day ? 'font-medium' : 'text-slate-300'}`}>
                            {fmtTce(match.tce_usd_per_day)}
                          </span>
                        </td>
                        {/* Column 6: Cargo (charterer) or Vessel (owner) */}
                        {isOwner ? (
                          <td className="py-[13px] px-3 align-middle">
                            <div className="flex items-center gap-[10px]">
                              <span className="w-7 h-7 rounded-[7px] bg-ds-accent text-ds-accent-fg flex-shrink-0 inline-flex items-center justify-center font-mono text-[11.5px] font-medium">
                                {vesselInitials(match.vessel_name ?? 'TBN')}
                              </span>
                              <span className="font-medium text-sm tracking-[-0.005em] break-words">{match.vessel_name ?? 'TBN'}</span>
                            </div>
                          </td>
                        ) : (
                          <td className="py-[13px] px-3 align-middle">
                            <span className={`font-mono text-[13px] whitespace-nowrap ${match.cargo_type ? '' : 'text-slate-300'}`}>
                              {match.cargo_type ?? '—'}
                            </span>
                          </td>
                        )}
                        {/* Laycan */}
                        <td className="py-[13px] px-3 text-right align-middle">
                          <span className="font-mono text-[12.5px] whitespace-nowrap text-ds-text-muted">
                            {fmtLaycan(match.laycan_start, match.laycan_end)}
                          </span>
                        </td>
                        {/* Actions */}
                        <td className="py-[13px] px-3 pr-5 align-middle">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAction(match.id, 'saved'); }}
                              className="w-7 h-7 rounded-[6px] inline-flex items-center justify-center text-ds-text-subtle hover:bg-ds-surface-muted hover:text-ds-text transition-all"
                              title="Save"
                              aria-label="Save match"
                            >☆</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/match/${match.id}`); }}
                              className="w-7 h-7 rounded-[6px] inline-flex items-center justify-center text-ds-text-subtle hover:bg-ds-surface-muted hover:text-ds-text transition-all"
                              title="Open"
                              aria-label="Open match detail"
                            >→</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-ds-border text-[12.5px] font-mono text-ds-text-muted bg-ds-surface-muted/30">
              <span>Showing {filtered.length} of {matches.length} · ranked by {SORT_LABELS[sortBy]}</span>
            </div>
          </section>
        )}
        </>)}

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
      <MatchToast match={latestMatch} onDismiss={dismissMatch} />
    </>
  );
}
