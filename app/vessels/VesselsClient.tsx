'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useMode } from '@/design-system/patterns/useMode';

export type VesselRow = {
  id: string;
  emailId: string;
  itemIndex: number;
  vesselName: string;
  vesselType: string | null;
  vesselKey: string;
  dwtSummer: string | null;
  openPosition: string | null;
  openDate: string | null;
  status: 'open' | 'match';
  sourceTag: 'Email' | 'Manual';
  sourceName: string;
};

interface Props {
  rows: VesselRow[];
  total: number;
}

const VESSEL_TYPE: Record<string, { bg: string; text: string; label: string }> = {
  bulk:    { bg: '#e2e8f0', text: '#334155', label: 'BLK' },
  tanker:  { bg: '#fef3c7', text: '#92400e', label: 'TNK' },
  general: { bg: '#ecfccb', text: '#3f6212', label: 'GC' },
  container: { bg: '#eff6ff', text: '#1d4ed8', label: 'CTR' },
  roro:    { bg: '#fce7f3', text: '#831843', label: 'RRO' },
  other:   { bg: '#e2e8f0', text: '#334155', label: 'VSL' },
};

function abbr(port: string): string {
  if (port.length <= 5 && port === port.toUpperCase()) return port;
  const words = port.trim().split(/[\s,/\-]+/).filter(Boolean);
  if (words.length === 1) return port.slice(0, 4).toUpperCase();
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

function VesselTypeBadge({ vk, label }: { vk: string; label: string }) {
  const s = VESSEL_TYPE[vk] ?? VESSEL_TYPE.other;
  return (
    <span
      className="flex-none w-[30px] h-[30px] rounded-[8px] grid place-items-center font-mono text-[10px] font-semibold tracking-wide select-none"
      style={{ background: s.bg, color: s.text, border: '1px solid rgba(15,23,42,0.06)' }}
      title={label}
    >
      {s.label}
    </span>
  );
}

function StatusPill({ status }: { status: 'open' | 'match' }) {
  if (status === 'match') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10.5px] font-medium tracking-wider uppercase bg-[#ecfdf5] text-[#166534] border border-[#d1fae5] whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
        Match
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10.5px] font-medium tracking-wider uppercase bg-[#fef3c7] text-[#92400e] border border-[#fde68a] whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
      Open
    </span>
  );
}

function SidePanel({ row, onClose }: { row: VesselRow; onClose: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed right-0 top-0 bottom-0 z-50 w-[420px] bg-white border-l border-[#e2e8f0] overflow-y-auto shadow-xl"
        role="complementary"
        aria-label="Vessel detail"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f3f7]">
          <h3 className="text-[15px] font-semibold text-[#0f172a]">Vessel detail</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] grid place-items-center text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors text-lg leading-none"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-5 space-y-5">
          <div className="flex items-center gap-3">
            <VesselTypeBadge vk={row.vesselKey} label={row.vesselType ?? 'Vessel'} />
            <div>
              <div className="text-[15px] font-semibold text-[#0f172a]">{row.vesselName}</div>
              <div className="font-mono text-[11.5px] text-[#64748b] mt-0.5">
                {row.vesselType ?? 'Vessel'}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {row.dwtSummer && (
              <>
                <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">DWT</dt>
                <dd className="font-mono text-[13.5px] text-[#0f172a]">{row.dwtSummer}</dd>
              </>
            )}
            {row.openPosition && (
              <>
                <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Open position</dt>
                <dd className="text-[13.5px] text-[#0f172a]">{row.openPosition}</dd>
              </>
            )}
            {row.openDate && (
              <>
                <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Open date</dt>
                <dd className="font-mono text-[13.5px] text-[#0f172a]">{row.openDate}</dd>
              </>
            )}
            <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Status</dt>
            <dd><StatusPill status={row.status} /></dd>
            <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Source</dt>
            <dd className="text-[13.5px] text-[#64748b]">
              <span className="font-mono text-[11px] text-[#94a3b8] px-1.5 py-0.5 rounded-full bg-[#f1f5f9] border border-[#e2e8f0] mr-1.5">
                {row.sourceTag}
              </span>
              <span className="text-[#0f172a]">{row.sourceName}</span>
            </dd>
          </dl>

          <Link
            href={`/vessel/${row.emailId}`}
            className="flex items-center justify-center gap-1.5 h-9 w-full rounded-[9px] bg-[#0f172a] text-white text-sm font-medium hover:-translate-y-px transition-transform"
            style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 2px rgba(15,23,42,0.15)' }}
          >
            Open full detail →
          </Link>
        </div>
      </aside>
    </>
  );
}

export default function VesselsClient({ rows, total }: Props) {
  const { isOwner } = useMode();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'match'>('all');
  const [selected, setSelected] = useState<VesselRow | null>(null);
  const [parseText, setParseText] = useState('');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.vesselName.toLowerCase().includes(q) ||
          (r.openPosition ?? '').toLowerCase().includes(q) ||
          r.sourceName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, search, statusFilter]);

  const parsePlaceholder = isOwner
    ? 'Paste open position email or describe vessel — AI will parse automatically…'
    : 'Paste vessel offer to match against your cargo…';

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* AI Parse Bar */}
      <div className="mx-auto max-w-[1280px] px-16 pt-6 pb-2">
        <div
          className="relative flex items-center gap-3 px-5 py-3 rounded-xl border border-[#e0e7ff] overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #faf5ff 100%)' }}
          role="region"
          aria-label="AI parse"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(600px 100px at 12% 0%, rgba(124,58,237,0.07), transparent 60%), radial-gradient(600px 100px at 88% 100%, rgba(37,99,235,0.07), transparent 60%)',
            }}
          />
          <div
            className="relative z-10 flex-none w-8 h-8 rounded-[9px] grid place-items-center text-white text-sm"
            style={{
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              boxShadow: '0 1px 2px rgba(79,70,229,0.25), 0 4px 12px rgba(124,58,237,0.18)',
            }}
            aria-hidden="true"
          >
            ✨
          </div>
          <input
            type="text"
            value={parseText}
            onChange={(e) => setParseText(e.target.value)}
            placeholder={parsePlaceholder}
            className="relative z-10 flex-1 bg-transparent border-0 outline-none text-sm text-[#0f172a] placeholder:text-[#64748b] placeholder:italic min-w-0"
            aria-label="AI parse input"
          />
          <button
            onClick={() => setParseText('')}
            className="relative z-10 h-[34px] px-4 rounded-[9px] bg-[#0f172a] text-white text-[13.5px] font-medium transition-all hover:-translate-y-px disabled:opacity-40"
            style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 2px rgba(15,23,42,0.15)' }}
            disabled={!parseText}
          >
            Parse
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-16">
        {/* Page header */}
        <header className="flex items-end justify-between gap-6 pt-5 pb-5">
          <h2 className="text-[30px] font-medium tracking-tight flex items-baseline gap-3 text-[#0f172a] m-0">
            Vessels
            <span className="font-mono text-sm font-normal text-[#64748b] tracking-normal">
              {total} items
            </span>
          </h2>
          <div className="flex items-center gap-2.5">
            <button className="h-[38px] px-3.5 rounded-[9px] border border-[#e2e8f0] bg-white text-[13.5px] font-medium text-[#0f172a] flex items-center gap-2 hover:border-[#cbd5e1] hover:bg-[#fafbfc] transition-all">
              ⇪ Import CSV
            </button>
            <button
              className="h-[38px] px-3.5 rounded-[9px] bg-[#0f172a] text-white text-[13.5px] font-medium flex items-center gap-2 transition-all hover:-translate-y-px"
              style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 2px rgba(15,23,42,0.15)' }}
            >
              + New vessel
            </button>
          </div>
        </header>

        {/* Toolbar */}
        <div className="flex items-center gap-2.5 pb-3.5">
          <label className="flex-none w-[300px] h-9 flex items-center gap-2.5 px-3 bg-white border border-[#e2e8f0] rounded-[9px]">
            <span className="text-[#94a3b8] text-sm select-none">⌕</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vessel, position, owner…"
              className="flex-1 border-0 outline-none bg-transparent text-[13.5px] text-[#0f172a] placeholder:text-[#94a3b8]"
              aria-label="Search vessels"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'match')}
            className="h-9 px-3 bg-white border border-[#e2e8f0] rounded-[9px] text-[13px] text-[#0f172a] cursor-pointer outline-none"
            aria-label="Filter by status"
          >
            <option value="all">Status: All</option>
            <option value="open">Open</option>
            <option value="match">Match</option>
          </select>
          <div className="flex-1" />
          <span className="font-mono text-[11.5px] text-[#64748b]">
            {filtered.length} of {total} · sorted by open date
          </span>
        </div>

        {/* Table */}
        <div
          className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden mb-3.5"
          data-testid="vessels-table-card"
        >
          {rows.length === 0 ? (
            <div className="py-16 text-center text-[#64748b] text-sm">
              No vessels found. Import emails or add vessel manually.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-[#64748b] text-sm">
              No vessels match the current filters.
            </div>
          ) : (
            <table className="w-full border-collapse text-sm" role="grid">
              <colgroup>
                <col style={{ width: '220px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '110px' }} />
                <col />
                <col style={{ width: '56px' }} />
              </colgroup>
              <thead>
                <tr>
                  {[
                    { label: 'Vessel', align: '' },
                    { label: 'DWT', align: 'text-right' },
                    { label: 'Open position', align: '' },
                    { label: 'Open date', align: '' },
                    { label: 'Status', align: '' },
                    { label: 'Source', align: '' },
                    { label: '⋯', align: 'text-right' },
                  ].map(({ label, align }) => (
                    <th
                      key={label}
                      className={`${align} font-mono text-[10.5px] tracking-widest uppercase text-[#94a3b8] font-medium px-3.5 py-3 border-b border-[#e2e8f0] bg-[#fbfcfd] whitespace-nowrap`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-[#f8fafc] border-b border-[#f1f3f7] last:border-0"
                    onClick={() => setSelected(row)}
                    role="row"
                    aria-selected={selected?.id === row.id}
                  >
                    <td className="px-3.5 py-3.5">
                      <div className="flex items-center gap-3">
                        <VesselTypeBadge vk={row.vesselKey} label={row.vesselType ?? 'Vessel'} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[14px] font-medium text-[#0f172a] leading-tight truncate">
                            {row.vesselName}
                          </span>
                          <span className="font-mono text-[11px] text-[#64748b] mt-0.5">
                            {(row.vesselType ?? 'vessel').toLowerCase()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-3.5 text-right font-mono text-[13.5px] text-[#0f172a] tabular-nums whitespace-nowrap">
                      {row.dwtSummer ?? <span className="text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-3.5 py-3.5 font-mono text-[13px] text-[#0f172a] whitespace-nowrap">
                      {row.openPosition ? (
                        abbr(row.openPosition)
                      ) : (
                        <span className="text-[#94a3b8]">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3.5 font-mono text-[12.5px] text-[#0f172a] whitespace-nowrap">
                      {row.openDate ?? <span className="text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-3.5 py-3.5">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-3.5 py-3.5 text-[13px] text-[#64748b] whitespace-nowrap">
                      <span className="font-mono text-[11px] text-[#94a3b8] px-1.5 py-0.5 rounded-full bg-[#f1f5f9] border border-[#e2e8f0] mr-1.5 tracking-wide">
                        {row.sourceTag}
                      </span>
                      <span className="text-[#0f172a]">{row.sourceName}</span>
                    </td>
                    <td className="px-3.5 py-3.5 text-right w-14">
                      <button
                        className="w-7 h-7 rounded-[7px] border border-transparent text-[#94a3b8] hover:border-[#e2e8f0] hover:bg-white hover:text-[#0f172a] transition-all text-base grid place-items-center"
                        aria-label="More actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ⋯
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Caption */}
        <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-[#94a3b8] pb-6">
          <span>Click row</span>
          <span className="text-[#cbd5e1]">→</span>
          <span>open detail in side panel</span>
        </div>
      </div>

      {selected && <SidePanel row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
