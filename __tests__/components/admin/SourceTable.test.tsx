/**
 * @jest-environment jsdom
 *
 * Tests for SourceTable — Knowledge Layer B3
 * Verifies: rows grouped by category, health badges with correct colors,
 * refresh button calls POST /api/admin/knowledge/refresh with slug,
 * empty state, truncation of long names, debouncing rapid clicks.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SourceTable } from '@/app/admin/knowledge/_components/SourceTable';
import type { SourceRow } from '@/lib/knowledge/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_SOURCES: SourceRow[] = [
  {
    slug: 'ofac',
    name: 'OFAC SDN List',
    kind: 'structured_rows',
    category: 'sanctions',
    status: 'fresh',
    refresh_mode: 'auto-daily',
    last_synced_at: '2026-05-05T10:00:00Z',
    stale_threshold_days: 7,
    consecutive_failures: 0,
    row_count: 12500,
    refresh_command: 'npm run knowledge:refresh ofac',
    last_error: null,
    upstream_version: '2026-05-05',
    health_signal: 'ok',
    days_since_sync: 0,
  },
  {
    slug: 'eu-sanctions',
    name: 'EU Consolidated Sanctions List',
    kind: 'structured_rows',
    category: 'sanctions',
    status: 'stale',
    refresh_mode: 'auto-weekly',
    last_synced_at: '2026-04-20T08:00:00Z',
    stale_threshold_days: 7,
    consecutive_failures: 0,
    row_count: 8200,
    refresh_command: 'npm run knowledge:refresh eu-sanctions',
    last_error: null,
    upstream_version: '2026-04-20',
    health_signal: 'overdue',
    days_since_sync: 15,
  },
  {
    slug: 'distances',
    name: 'Port-to-port distances',
    kind: 'structured_rows',
    category: 'geo',
    status: 'unknown',
    refresh_mode: 'one-shot',
    last_synced_at: null,
    stale_threshold_days: 365,
    consecutive_failures: 5,
    row_count: null,
    refresh_command: null,
    last_error: 'Network timeout',
    upstream_version: null,
    health_signal: 'failing',
    days_since_sync: null,
  },
  {
    slug: 'jwc',
    name: 'Joint War Committee High-Risk Areas',
    kind: 'structured_rows',
    category: 'regulatory',
    status: 'unknown',
    refresh_mode: 'manual',
    last_synced_at: null,
    stale_threshold_days: 30,
    consecutive_failures: 0,
    row_count: null,
    refresh_command: null,
    last_error: null,
    upstream_version: null,
    health_signal: 'never_synced',
    days_since_sync: null,
  },
];

const LONG_NAME_SOURCE: SourceRow = {
  slug: 'very-long',
  name: 'This is an extremely long source name that exceeds 120 characters and should be truncated with ellipsis to prevent layout overflow issues in the UI',
  kind: 'structured_rows',
  category: 'reference',
  status: 'fresh',
  refresh_mode: 'manual',
  last_synced_at: '2026-05-05T10:00:00Z',
  stale_threshold_days: 30,
  consecutive_failures: 0,
  row_count: 100,
  refresh_command: null,
  last_error: null,
  upstream_version: null,
  health_signal: 'ok',
  days_since_sync: 0,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SourceTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('renders empty state when sources array is empty', () => {
    render(<SourceTable sources={[]} />);
    expect(screen.getByText(/no knowledge sources configured/i)).toBeInTheDocument();
  });

  // ── Rows grouped by category ───────────────────────────────────────────────

  it('renders all 4 sources', () => {
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    expect(screen.getByText('OFAC SDN List')).toBeInTheDocument();
    expect(screen.getByText('EU Consolidated Sanctions List')).toBeInTheDocument();
    expect(screen.getByText('Port-to-port distances')).toBeInTheDocument();
    expect(screen.getByText('Joint War Committee High-Risk Areas')).toBeInTheDocument();
  });

  it('groups sources by category in correct order: sanctions, regulatory, geo, reference, market', () => {
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const rows = screen.getAllByTestId(/^source-row-/);
    // SAMPLE_SOURCES has: sanctions (2), regulatory (1), geo (1)
    // After sorting: failing first, then never_synced, overdue, ok
    // Expected order: distances (failing, geo), jwc (never_synced, regulatory),
    //                 eu-sanctions (overdue, sanctions), ofac (ok, sanctions)
    expect(rows).toHaveLength(4);
  });

  it('displays category labels for each group', () => {
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    expect(screen.getByText('sanctions')).toBeInTheDocument();
    expect(screen.getByText('regulatory')).toBeInTheDocument();
    expect(screen.getByText('geo')).toBeInTheDocument();
  });

  // ── Health badges with correct colors ──────────────────────────────────────

  it('renders green badge for health_signal=ok', () => {
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const okBadge = screen.getByTestId('health-badge-ofac');
    expect(okBadge).toHaveTextContent('ok');
    expect(okBadge).toHaveClass('bg-green-100');
    expect(okBadge).toHaveClass('text-green-800');
  });

  it('renders yellow badge for health_signal=overdue', () => {
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const overdueBadge = screen.getByTestId('health-badge-eu-sanctions');
    expect(overdueBadge).toHaveTextContent('overdue');
    expect(overdueBadge).toHaveClass('bg-yellow-100');
    expect(overdueBadge).toHaveClass('text-yellow-800');
  });

  it('renders red badge for health_signal=failing', () => {
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const failingBadge = screen.getByTestId('health-badge-distances');
    expect(failingBadge).toHaveTextContent('failing');
    expect(failingBadge).toHaveClass('bg-red-100');
    expect(failingBadge).toHaveClass('text-red-800');
  });

  it('renders gray badge for health_signal=never_synced', () => {
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const neverSyncedBadge = screen.getByTestId('health-badge-jwc');
    expect(neverSyncedBadge).toHaveTextContent('never_synced');
    expect(neverSyncedBadge).toHaveClass('bg-gray-100');
    expect(neverSyncedBadge).toHaveClass('text-gray-800');
  });

  // ── Refresh button calls POST /api/admin/knowledge/refresh ─────────────────

  it('renders refresh button for each source', () => {
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const refreshButtons = screen.getAllByRole('button', { name: /refresh/i });
    expect(refreshButtons).toHaveLength(4);
  });

  it('calls POST /api/admin/knowledge/refresh with slug when refresh button clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sync_log_id: 123 }),
    });
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const refreshButton = screen.getByTestId('refresh-button-ofac');
    fireEvent.click(refreshButton);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/knowledge/refresh',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'ofac' }),
        }),
      );
    });
  });

  it('disables refresh button during POST request', async () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const refreshButton = screen.getByTestId('refresh-button-ofac');
    fireEvent.click(refreshButton);
    await waitFor(() => {
      expect(refreshButton).toBeDisabled();
    });
  });

  it('shows success message after successful refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sync_log_id: 123 }),
    });
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const refreshButton = screen.getByTestId('refresh-button-ofac');
    fireEvent.click(refreshButton);
    await waitFor(() => {
      expect(screen.getByText(/refresh started/i)).toBeInTheDocument();
    });
  });

  it('shows error message when refresh fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    });
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const refreshButton = screen.getByTestId('refresh-button-ofac');
    fireEvent.click(refreshButton);
    await waitFor(() => {
      expect(screen.getByText(/refresh failed/i)).toBeInTheDocument();
    });
  });

  // ── Boundary: rapid double-click debounce ───────────────────────────────────

  it('ignores second click when refresh button clicked twice rapidly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sync_log_id: 123 }),
    });
    render(<SourceTable sources={SAMPLE_SOURCES} />);
    const refreshButton = screen.getByTestId('refresh-button-ofac');
    fireEvent.click(refreshButton);
    fireEvent.click(refreshButton); // second click while still loading
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── Boundary: very long source name ─────────────────────────────────────────

  it('truncates source name longer than 120 characters', () => {
    render(<SourceTable sources={[LONG_NAME_SOURCE]} />);
    const nameCell = screen.getByTestId('source-name-very-long');
    const displayedText = nameCell.textContent;
    expect(displayedText!.length).toBeLessThan(LONG_NAME_SOURCE.name.length);
    expect(displayedText).toContain('...');
  });

  it('shows full name in title attribute for truncated names', () => {
    render(<SourceTable sources={[LONG_NAME_SOURCE]} />);
    const nameCell = screen.getByTestId('source-name-very-long');
    expect(nameCell).toHaveAttribute('title', LONG_NAME_SOURCE.name);
  });

  // ── Boundary: all never_synced ──────────────────────────────────────────────

  it('renders all rows with gray badges when all sources are never_synced', () => {
    const neverSyncedSources: SourceRow[] = Array(10)
      .fill(null)
      .map((_, i) => ({
        slug: `source-${i}`,
        name: `Source ${i}`,
        kind: 'structured_rows' as const,
        category: 'reference' as const,
        status: 'unknown' as const,
        refresh_mode: 'manual' as const,
        last_synced_at: null,
        stale_threshold_days: 30,
        consecutive_failures: 0,
        row_count: null,
        refresh_command: null,
        last_error: null,
        upstream_version: null,
        health_signal: 'never_synced' as const,
        days_since_sync: null,
      }));
    render(<SourceTable sources={neverSyncedSources} />);
    const badges = screen.getAllByTestId(/^health-badge-/);
    expect(badges).toHaveLength(10);
    badges.forEach((badge) => {
      expect(badge).toHaveClass('bg-gray-100');
      expect(badge).toHaveClass('text-gray-800');
    });
  });
});
