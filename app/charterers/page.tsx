'use client';

/**
 * Input Contract:
 * - NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED !== 'true' → show "Feature not enabled"
 * - Feature enabled → fetch GET /api/charterers → render CharterersTable
 * - "Add Charterer" button → show NewChartererModal
 * - Modal submit → POST /api/charterers → refresh list
 */

import { useEffect, useMemo, useState } from 'react';
import { CharterersTable, type Charterer } from '@/components/charterers/CharterersTable';
import { NewChartererModal } from '@/components/charterers/NewChartererModal';

export default function CharterersPage() {
  const isFeatureEnabled =
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED === 'true';

  const [charterers, setCharterers] = useState<Charterer[]>([]);
  const [loading, setLoading] = useState(isFeatureEnabled);
  const [showForm, setShowForm] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'alpha'>('recent');

  const displayed = useMemo(() => {
    const filtered = filterQuery
      ? charterers.filter(c => c.name.toLowerCase().includes(filterQuery.toLowerCase()))
      : charterers;
    if (sortOrder === 'alpha') return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [charterers, filterQuery, sortOrder]);

  useEffect(() => {
    if (!isFeatureEnabled) return;

    fetch('/api/charterers')
      .then((r) => r.json())
      .then((data) => {
        setCharterers(data.charterers ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isFeatureEnabled]);

  if (!isFeatureEnabled) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--ds-bg)', padding: '32px 16px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ border: '1px solid var(--ds-border)', borderRadius: 10, background: 'var(--ds-surface)', padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--ds-text)' }}>Feature Not Enabled</h2>
            <p style={{ fontSize: 14, color: 'var(--ds-text-muted)' }}>
              Charterer credit tracking is not enabled. Contact your administrator to enable this feature.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--ds-bg)', paddingBottom: 64 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>

        {/* Page header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 0 20px' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ds-text)', lineHeight: 1.2 }}>
              Charterers
            </h1>
            {charterers.length > 0 && (
              <span style={{ fontSize: 13, color: 'var(--ds-text-muted)', fontFamily: '"Geist Mono", ui-monospace, monospace' }}>
                {filterQuery ? `${displayed.length} of ${charterers.length}` : charterers.length} contacts
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              aria-label="Import Gmail"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px',
                fontSize: 14, fontWeight: 500,
                background: 'var(--ds-surface)', color: 'var(--ds-text)',
                border: '1px solid var(--ds-border)', borderRadius: 8,
                cursor: 'pointer',
                letterSpacing: '-0.01em',
              }}
            >
              Import Gmail
            </button>
            <button
              onClick={() => setShowForm((v) => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px',
                fontSize: 14, fontWeight: 500,
                background: 'var(--ds-accent)', color: 'var(--ds-accent-fg)',
                border: 'none', borderRadius: 8,
                cursor: 'pointer',
                letterSpacing: '-0.01em',
              }}
            >
              <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              Add Charterer
            </button>
          </div>
        </header>

        {/* FilterBar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <input
            type="search"
            aria-label="Search by company"
            placeholder="Search by company…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{
              flex: 1,
              height: 36,
              padding: '0 12px',
              fontSize: 14,
              border: '1px solid var(--ds-border)',
              borderRadius: 8,
              background: 'var(--ds-surface)',
              color: 'var(--ds-text)',
              outline: 'none',
            }}
          />
          <select
            aria-label="Sort order"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'recent' | 'alpha')}
            style={{
              height: 36,
              padding: '0 10px',
              fontSize: 13,
              border: '1px solid var(--ds-border)',
              borderRadius: 8,
              background: 'var(--ds-surface)',
              color: 'var(--ds-text)',
              cursor: 'pointer',
            }}
          >
            <option value="recent">Recent</option>
            <option value="alpha">Alphabetical</option>
          </select>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, fontFamily: '"Geist Mono", ui-monospace, monospace', fontSize: 11, color: 'var(--ds-text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 8, borderRadius: 3, background: 'var(--ds-accent-soft)', border: '1px solid var(--ds-border)', display: 'inline-block' }} />
            Hot
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 8, borderRadius: 3, background: 'var(--ds-surface)', border: '1px solid var(--ds-border)', display: 'inline-block' }} />
            Warm
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 8, borderRadius: 3, background: 'var(--ds-bg)', border: '1px solid var(--ds-border)', display: 'inline-block' }} />
            Cold
          </span>
        </div>

        {showForm && (
          <NewChartererModal
            onCreated={(newCharterer) => {
              setCharterers((prev) => [...prev, newCharterer]);
              setShowForm(false);
              fetch('/api/charterers')
                .then((r) => r.json())
                .then((data) => setCharterers(data.charterers ?? []));
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Table card */}
        {loading ? (
          <p style={{ fontSize: 14, color: 'var(--ds-text-muted)', padding: '32px 0', textAlign: 'center' }}>Loading…</p>
        ) : (
          <div style={{ border: '1px solid var(--ds-border)', borderRadius: 10, background: 'var(--ds-surface)', overflow: 'hidden' }}>
            <CharterersTable charterers={displayed} />
          </div>
        )}
      </div>
    </main>
  );
}
