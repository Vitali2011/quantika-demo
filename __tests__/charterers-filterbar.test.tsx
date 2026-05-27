/**
 * @jest-environment jsdom
 *
 * Behavioral tests for #504: /charterers FilterBar
 * - text search filters by NAME/EMAIL substring
 * - sort dropdown reorders rows (Company A-Z, Last Contact desc/asc)
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/charterers',
  useSearchParams: () => new URLSearchParams(),
}));

const SAMPLE = [
  { id: '1', name: 'Alpha Corp', tier: 'blue-chip', require_lc: 0, notes: null, email: 'alpha@corp.com', created_at: '2026-01-01T00:00:00Z' },
  { id: '2', name: 'Beta Ltd',   tier: 'second',    require_lc: 1, notes: null, email: null,             created_at: '2026-03-01T00:00:00Z' },
  { id: '3', name: 'Gamma SA',   tier: 'weak',      require_lc: 0, notes: null, email: 'gamma@sa.com',   created_at: '2026-02-01T00:00:00Z' },
];

import CharterersPage from '@/app/charterers/page';

describe('Charterers FilterBar (#504)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ charterers: SAMPLE }),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED;
  });

  it('renders search input and sort dropdown', async () => {
    render(<CharterersPage />);
    await waitFor(() => expect(screen.getByText('Alpha Corp')).toBeInTheDocument());
    expect(screen.getByRole('searchbox', { name: /search charterers/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /sort order/i })).toBeInTheDocument();
  });

  it('typing name filters rows to matching company', async () => {
    const user = userEvent.setup();
    render(<CharterersPage />);
    await waitFor(() => expect(screen.getByText('Alpha Corp')).toBeInTheDocument());

    await user.type(screen.getByRole('searchbox', { name: /search charterers/i }), 'alpha');

    expect(screen.getByText('Alpha Corp')).toBeInTheDocument();
    expect(screen.queryByText('Beta Ltd')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma SA')).not.toBeInTheDocument();
  });

  it('typing email filters rows by email substring', async () => {
    const user = userEvent.setup();
    render(<CharterersPage />);
    await waitFor(() => expect(screen.getByText('Alpha Corp')).toBeInTheDocument());

    await user.type(screen.getByRole('searchbox', { name: /search charterers/i }), 'gamma@sa');

    expect(screen.getByText('Gamma SA')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Corp')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Ltd')).not.toBeInTheDocument();
  });

  it('sort Company A-Z orders rows alphabetically', async () => {
    const user = userEvent.setup();
    render(<CharterersPage />);
    await waitFor(() => expect(screen.getByText('Alpha Corp')).toBeInTheDocument());

    await user.selectOptions(screen.getByRole('combobox', { name: /sort order/i }), 'alpha');

    const cells = screen.getAllByRole('cell').filter(td =>
      ['Alpha Corp', 'Beta Ltd', 'Gamma SA'].some(n => td.textContent?.includes(n))
    );
    const names = cells.map(td => td.textContent?.trim());
    expect(names[0]).toContain('Alpha Corp');
    expect(names[1]).toContain('Beta Ltd');
    expect(names[2]).toContain('Gamma SA');
  });

  it('sort Last Contact desc shows newest (2026-03-01) first', async () => {
    const user = userEvent.setup();
    render(<CharterersPage />);
    await waitFor(() => expect(screen.getByText('Alpha Corp')).toBeInTheDocument());

    await user.selectOptions(screen.getByRole('combobox', { name: /sort order/i }), 'contact-desc');

    const rows = screen.getAllByRole('row').filter(r => r.getAttribute('data-status'));
    expect(rows[0]).toHaveTextContent('Beta Ltd');
    expect(rows[1]).toHaveTextContent('Gamma SA');
    expect(rows[2]).toHaveTextContent('Alpha Corp');
  });

  it('sort Last Contact asc shows oldest (2026-01-01) first', async () => {
    const user = userEvent.setup();
    render(<CharterersPage />);
    await waitFor(() => expect(screen.getByText('Alpha Corp')).toBeInTheDocument());

    await user.selectOptions(screen.getByRole('combobox', { name: /sort order/i }), 'contact-asc');

    const rows = screen.getAllByRole('row').filter(r => r.getAttribute('data-status'));
    expect(rows[0]).toHaveTextContent('Alpha Corp');
    expect(rows[1]).toHaveTextContent('Gamma SA');
    expect(rows[2]).toHaveTextContent('Beta Ltd');
  });
});
