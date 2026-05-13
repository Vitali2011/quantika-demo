'use client';

/**
 * Input Contract:
 * - NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED !== 'true' → show "Feature not enabled"
 * - Feature enabled → fetch GET /api/charterers → render CharterersTable
 * - "Add Charterer" button → show NewChartererModal
 * - Modal submit → POST /api/charterers → refresh list
 */

import { useEffect, useState } from 'react';
import { CharterersTable, type Charterer } from '@/components/charterers/CharterersTable';
import { NewChartererModal } from '@/components/charterers/NewChartererModal';

export default function CharterersPage() {
  const isFeatureEnabled =
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED === 'true';

  const [charterers, setCharterers] = useState<Charterer[]>([]);
  const [loading, setLoading] = useState(isFeatureEnabled);
  const [showForm, setShowForm] = useState(false);

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
      <main className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="border rounded-lg bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Feature Not Enabled</h2>
            <p className="text-sm text-muted-foreground">
              Charterer credit tracking is not enabled. Contact your administrator
              to enable this feature.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Charterers</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Charterer
          </button>
        </div>

        {showForm && (
          <NewChartererModal
            onCreated={(newCharterer) => {
              setCharterers((prev) => [...prev, newCharterer]);
              setShowForm(false);
              // Refresh from server to get canonical data
              fetch('/api/charterers')
                .then((r) => r.json())
                .then((data) => setCharterers(data.charterers ?? []));
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
        ) : (
          <div className="border rounded-lg bg-white shadow-sm">
            <CharterersTable charterers={charterers} />
          </div>
        )}
      </div>
    </main>
  );
}
