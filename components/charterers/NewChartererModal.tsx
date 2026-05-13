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

  return (
    <div className="border rounded-lg bg-white p-6 shadow-sm mt-4">
      <h2 className="text-lg font-semibold mb-4">New Charterer</h2>

      {error && (
        <p className="text-sm text-red-600 mb-3">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="charterer-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            id="charterer-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Cargill International"
          />
        </div>

        <div>
          <label htmlFor="charterer-tier" className="block text-sm font-medium text-gray-700 mb-1">
            Tier
          </label>
          <select
            id="charterer-tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as 'blue-chip' | 'second' | 'weak')}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="blue-chip">Blue-chip</option>
            <option value="second">Second</option>
            <option value="weak">Weak</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="charterer-require-lc"
            type="checkbox"
            checked={requireLc}
            onChange={(e) => setRequireLc(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="charterer-require-lc" className="text-sm font-medium text-gray-700">
            Letter of Credit Required
          </label>
        </div>

        <div>
          <label htmlFor="charterer-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            id="charterer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Optional notes..."
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
