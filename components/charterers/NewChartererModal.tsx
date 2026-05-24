'use client';

import { useState } from 'react';

interface Props {
  onCreated: (charterer: {
    id: string;
    name: string;
    tier: 'blue-chip' | 'second' | 'weak';
    require_lc: number;
    notes: string | null;
  }) => void;
  onCancel: () => void;
}

export function NewChartererModal({ onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState<'blue-chip' | 'second' | 'weak'>('second');
  const [requireLc, setRequireLc] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/charterers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          tier,
          require_lc: requireLc ? 1 : 0,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create charterer');
      }

      const created = await res.json();
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid var(--ds-border)',
    borderRadius: 7,
    padding: '8px 12px',
    fontSize: 14,
    color: 'var(--ds-text)',
    background: 'var(--ds-surface)',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--ds-text-muted)',
    marginBottom: 6,
  };

  return (
    <div style={{
      border: '1px solid var(--ds-border)',
      borderRadius: 10,
      background: 'var(--ds-surface)',
      padding: 24,
      marginBottom: 16,
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: 'var(--ds-text)', letterSpacing: '-0.01em' }}>
        New Charterer
      </h2>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--ds-danger)', marginBottom: 12 }}>{error}</p>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label htmlFor="charterer-name" style={labelStyle}>Name</label>
          <input
            id="charterer-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={inputStyle}
            placeholder="e.g. Cargill International"
          />
        </div>

        <div>
          <label htmlFor="charterer-tier" style={labelStyle}>Tier</label>
          <select
            id="charterer-tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as 'blue-chip' | 'second' | 'weak')}
            style={inputStyle}
          >
            <option value="blue-chip">Blue-chip (Hot)</option>
            <option value="second">Second (Warm)</option>
            <option value="weak">Weak (Cold)</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id="charterer-require-lc"
            type="checkbox"
            checked={requireLc}
            onChange={(e) => setRequireLc(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="charterer-require-lc" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-muted)' }}>
            Letter of Credit Required
          </label>
        </div>

        <div>
          <label htmlFor="charterer-notes" style={labelStyle}>Notes</label>
          <textarea
            id="charterer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Optional notes…"
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px', fontSize: 14,
              border: '1px solid var(--ds-border)', borderRadius: 7,
              background: 'var(--ds-surface)', color: 'var(--ds-text)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '8px 16px', fontSize: 14, fontWeight: 500,
              border: 'none', borderRadius: 7,
              background: 'var(--ds-accent)', color: 'var(--ds-accent-fg)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
