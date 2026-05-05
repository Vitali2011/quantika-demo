'use client';

import type { SourceRow } from '@/lib/knowledge/types';
import { useState } from 'react';

interface SourceTableProps {
  sources: SourceRow[];
}

/**
 * SourceTable — Client component for Knowledge Layer admin dashboard
 *
 * Input contract:
 * - sources: SourceRow[] — array of knowledge sources (can be empty)
 * - Empty array → renders empty state component
 * - Names >120 chars → truncated with ellipsis, full name in title attr
 * - Refresh button debounced: disabled during POST, ignores rapid clicks
 */
export function SourceTable({ sources }: SourceTableProps) {
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Empty state
  if (sources.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p>No knowledge sources configured</p>
      </div>
    );
  }

  // Group sources by category
  const categories = Array.from(new Set(sources.map((s) => s.category)));
  const groupedSources = categories.map((category) => ({
    category,
    items: sources.filter((s) => s.category === category),
  }));

  async function handleRefresh(slug: string) {
    // Debounce: ignore if already loading
    if (loadingSlug) return;

    setLoadingSlug(slug);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/knowledge/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessage({ type: 'success', text: `Refresh started (sync_log_id: ${data.sync_log_id})` });
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: `Refresh failed: ${error.error || 'Unknown error'}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Refresh failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setLoadingSlug(null);
    }
  }

  function truncateName(name: string, maxLength = 120): { display: string; full: string } {
    if (name.length <= maxLength) {
      return { display: name, full: name };
    }
    return { display: name.slice(0, maxLength - 3) + '...', full: name };
  }

  function getHealthBadgeClasses(health: string): string {
    switch (health) {
      case 'ok':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-yellow-100 text-yellow-800';
      case 'failing':
        return 'bg-red-100 text-red-800';
      case 'never_synced':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800'; // fallback for unknown
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-md p-4 ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {groupedSources.map(({ category, items }) => (
        <div key={category}>
          <h2 className="text-lg font-semibold mb-2 text-gray-700">{category}</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Health
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Synced
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rows
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((source) => {
                  const { display, full } = truncateName(source.name);
                  return (
                    <tr key={source.slug} data-testid={`source-row-${source.slug}`}>
                      <td className="px-4 py-3 text-sm">
                        <div
                          className="font-medium text-gray-900"
                          data-testid={`source-name-${source.slug}`}
                          title={full}
                        >
                          {display}
                        </div>
                        <div className="text-xs text-gray-500">{source.slug}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHealthBadgeClasses(source.health_signal)}`}
                          data-testid={`health-badge-${source.slug}`}
                        >
                          {source.health_signal}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {source.last_synced_at
                          ? new Date(source.last_synced_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {source.row_count?.toLocaleString() ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => handleRefresh(source.slug)}
                          disabled={loadingSlug === source.slug}
                          data-testid={`refresh-button-${source.slug}`}
                          className="text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          {loadingSlug === source.slug ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
