'use client';

import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMode } from '@/design-system/patterns/useMode';
import { abbrPort } from '@/lib/utils/abbr-port';

export type CargoRow = {
  id: string;
  emailId: string;
  itemIndex: number;
  commodity: string;
  cargoType: string;
  commodityKey: string;
  originPort: string | null;
  destinationPort: string | null;
  quantity: string | null;
  laycan: string | null;
  status: 'open' | 'match';
  sourceTag: 'Email' | 'Manual';
  sourceName: string;
};

interface Props {
  rows: CargoRow[];
  total: number;
}

const COMMOD: Record<string, { bg: string; text: string; label: string }> = {
  hss:     { bg: '#fef3c7', text: '#92400e', label: 'HSS' },
  grain:   { bg: '#ecfccb', text: '#3f6212', label: 'GR' },
  coal:    { bg: '#1e293b', text: '#cbd5e1', label: 'CL' },
  clinker: { bg: '#e2e8f0', text: '#334155', label: 'CK' },
  sugar:   { bg: '#fce7f3', text: '#831843', label: 'SG' },
  bulk:    { bg: '#e2e8f0', text: '#334155', label: 'BK' },
};

const abbr = abbrPort;

function CommodityBadge({ ck }: { ck: string }) {
  const s = COMMOD[ck] ?? COMMOD.bulk;
  return (
    <span
      className="flex-none w-[30px] h-[30px] rounded-[8px] grid place-items-center font-mono text-[11px] font-semibold tracking-wide select-none"
      style={{ background: s.bg, color: s.text, border: '1px solid rgba(15,23,42,0.06)' }}
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

function SidePanel({ row, onClose }: { row: CargoRow; onClose: () => void }) {
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
        aria-label="Cargo detail"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f3f7]">
          <h3 className="text-[15px] font-semibold text-[#0f172a]">Cargo detail</h3>
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
            <CommodityBadge ck={row.commodityKey} />
            <div>
              <div className="text-[15px] font-semibold text-[#0f172a]">{row.commodity}</div>
              <div className="font-mono text-[11.5px] text-[#64748b] mt-0.5">{row.cargoType}</div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {row.originPort && (
              <>
                <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Origin</dt>
                <dd className="text-[13.5px] text-[#0f172a]">{row.originPort}</dd>
              </>
            )}
            {row.destinationPort && (
              <>
                <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Destination</dt>
                <dd className="text-[13.5px] text-[#0f172a]">{row.destinationPort}</dd>
              </>
            )}
            {row.quantity && (
              <>
                <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Quantity</dt>
                <dd className="font-mono text-[13.5px] text-[#0f172a]">{row.quantity}</dd>
              </>
            )}
            {row.laycan && (
              <>
                <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Laycan</dt>
                <dd className="font-mono text-[13.5px] text-[#0f172a]">{row.laycan}</dd>
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
            href={`/cargo/${row.emailId}`}
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

interface NewCargoForm {
  commodity: string;
  originPort: string;
  destinationPort: string;
  quantityMt: string;
  laycan: string;
}

const EMPTY_FORM: NewCargoForm = {
  commodity: '',
  originPort: '',
  destinationPort: '',
  quantityMt: '',
  laycan: '',
};

function NewCargoPanel({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<NewCargoForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.commodity.trim()) {
      setError('Commodity is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/cargo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              commodity: form.commodity,
              originPort: form.originPort || undefined,
              destinationPort: form.destinationPort || undefined,
              quantityMt: form.quantityMt ? parseFloat(form.quantityMt) : null,
              laycan: form.laycan || undefined,
            },
          ],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <aside
        className="fixed right-0 top-0 bottom-0 z-50 w-[420px] bg-white border-l border-[#e2e8f0] overflow-y-auto shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Add cargo"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f3f7]">
          <h3 className="text-[15px] font-semibold text-[#0f172a]">New cargo</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] grid place-items-center text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors text-lg leading-none"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {error && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">
              {error}
            </p>
          )}
          {[
            { label: 'Commodity', name: 'commodity', placeholder: 'e.g. Wheat', required: true },
            { label: 'Origin port', name: 'originPort', placeholder: 'e.g. Odessa' },
            { label: 'Destination port', name: 'destinationPort', placeholder: 'e.g. Rotterdam' },
            { label: 'Quantity MT', name: 'quantityMt', placeholder: 'e.g. 35000' },
            { label: 'Laycan', name: 'laycan', placeholder: 'e.g. 01–15 Jul 2026' },
          ].map(({ label, name, placeholder, required }) => (
            <div key={name}>
              <label className="block font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8] mb-1.5">
                {label}
                {required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <input
                type="text"
                value={form[name as keyof NewCargoForm]}
                onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
                placeholder={placeholder}
                className="w-full h-9 px-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px] text-[13.5px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none focus:border-[#6366f1] focus:bg-white transition-colors"
                aria-label={label}
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-1.5 h-9 w-full rounded-[9px] bg-[#0f172a] text-white text-sm font-medium hover:-translate-y-px disabled:opacity-50 transition-all mt-2"
            style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 2px rgba(15,23,42,0.15)' }}
          >
            {saving ? 'Saving…' : 'Add cargo'}
          </button>
        </form>
      </aside>
    </>
  );
}

function parseCsvText(
  text: string,
): Array<{ commodity: string; originPort: string; destinationPort: string; quantityMt: number | null; laycan: string }> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const firstLower = lines[0].toLowerCase();
  const hasHeader =
    firstLower.includes('commodity') ||
    firstLower.includes('origin') ||
    firstLower.includes('cargo');
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      const qty = cols[3] ? parseFloat(cols[3]) : NaN;
      return {
        commodity: cols[0] ?? '',
        originPort: cols[1] ?? '',
        destinationPort: cols[2] ?? '',
        quantityMt: Number.isFinite(qty) ? qty : null,
        laycan: cols[4] ?? '',
      };
    })
    .filter((r) => r.commodity || r.originPort);
}

export default function CargoClient({ rows, total }: Props) {
  const { isCharterer } = useMode();
  const router = useRouter();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'match'>('all');
  const [selected, setSelected] = useState<CargoRow | null>(null);
  const [parseText, setParseText] = useState('');
  const [showNewCargoPanel, setShowNewCargoPanel] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function showNote(type: 'success' | 'error', message: string) {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const text = await file.text();
    const items = parseCsvText(text);
    if (items.length === 0) {
      showNote('error', 'No valid rows found in CSV. Expected: commodity,origin,destination,quantity_mt,laycan');
      return;
    }
    try {
      const res = await fetch('/api/cargo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const { added } = (await res.json()) as { added: number };
      showNote('success', `${added} cargo item${added !== 1 ? 's' : ''} imported`);
      router.refresh();
    } catch (err) {
      showNote('error', err instanceof Error ? err.message : 'Import failed');
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.commodity.toLowerCase().includes(q) ||
          (r.originPort ?? '').toLowerCase().includes(q) ||
          (r.destinationPort ?? '').toLowerCase().includes(q) ||
          r.sourceName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, search, statusFilter]);

  const parsePlaceholder = isCharterer
    ? 'Paste email from broker or describe cargo in words — AI will parse automatically…'
    : 'Paste cargo inquiry to compare against your fleet…';

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
            Cargo
            <span className="font-mono text-sm font-normal text-[#64748b] tracking-normal">
              {total} items
            </span>
          </h2>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => csvInputRef.current?.click()}
              className="h-[38px] px-3.5 rounded-[9px] border border-[#e2e8f0] bg-white text-[13.5px] font-medium text-[#0f172a] flex items-center gap-2 hover:border-[#cbd5e1] hover:bg-[#fafbfc] transition-all"
              aria-label="Import CSV"
            >
              ⇪ Import CSV
            </button>
            <button
              onClick={() => setShowNewCargoPanel(true)}
              className="h-[38px] px-3.5 rounded-[9px] bg-[#0f172a] text-white text-[13.5px] font-medium flex items-center gap-2 transition-all hover:-translate-y-px"
              style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 2px rgba(15,23,42,0.15)' }}
              aria-label="New cargo"
            >
              + New cargo
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
              placeholder="Search cargo, route, charterer…"
              className="flex-1 border-0 outline-none bg-transparent text-[13.5px] text-[#0f172a] placeholder:text-[#94a3b8]"
              aria-label="Search cargo"
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
            {filtered.length} of {total} · sorted by laycan
          </span>
        </div>

        {/* Table */}
        <div
          className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden mb-3.5"
          data-testid="cargo-table-card"
        >
          {rows.length === 0 ? (
            <div className="py-16 text-center text-[#64748b] text-sm">
              No cargo found. Import emails or add cargo manually.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-[#64748b] text-sm">
              No cargo matches the current filters.
            </div>
          ) : (
            <table className="w-full border-collapse text-sm" role="grid">
              <colgroup>
                <col style={{ width: '220px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '110px' }} />
                <col />
                <col style={{ width: '56px' }} />
              </colgroup>
              <thead>
                <tr>
                  {[
                    { label: 'Cargo', align: '' },
                    { label: 'Qty', align: 'text-right' },
                    { label: 'Route', align: '' },
                    { label: 'Laycan', align: '' },
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
                        <CommodityBadge ck={row.commodityKey} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[14px] font-medium text-[#0f172a] leading-tight truncate">
                            {row.commodity}
                          </span>
                          <span className="font-mono text-[11px] text-[#64748b] mt-0.5">
                            {row.cargoType.toLowerCase()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-3.5 text-right font-mono text-[13.5px] text-[#0f172a] tabular-nums whitespace-nowrap">
                      {row.quantity ?? <span className="text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-3.5 py-3.5 font-mono text-[13px] text-[#0f172a] whitespace-nowrap">
                      {row.originPort ? (
                        <>
                          <span>{abbr(row.originPort)}</span>
                          <span className="text-[#cbd5e1] mx-1">→</span>
                          <span>{row.destinationPort ? abbr(row.destinationPort) : '?'}</span>
                        </>
                      ) : (
                        <span className="text-[#94a3b8]">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3.5 font-mono text-[12.5px] text-[#0f172a] whitespace-nowrap">
                      {row.laycan ?? <span className="text-[#94a3b8]">—</span>}
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
      {showNewCargoPanel && (
        <NewCargoPanel
          onClose={() => setShowNewCargoPanel(false)}
          onSaved={() => {
            setShowNewCargoPanel(false);
            router.refresh();
          }}
        />
      )}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleCsvFile}
        data-testid="csv-file-input"
      />
      {notification && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-[10px] text-[13.5px] font-medium shadow-lg border ${
            notification.type === 'success'
              ? 'bg-[#ecfdf5] text-[#166534] border-[#d1fae5]'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {notification.message}
        </div>
      )}
    </div>
  );
}
