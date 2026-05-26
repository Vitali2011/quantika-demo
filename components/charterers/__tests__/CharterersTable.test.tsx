/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/charterers',
  useSearchParams: () => new URLSearchParams(),
}));

import { CharterersTable, type Charterer } from '../CharterersTable';

const SAMPLE: Charterer[] = [
  { id: '1', name: 'Alpha Corp', tier: 'blue-chip', require_lc: 0, notes: 'big player' },
  { id: '2', name: 'Beta Ltd', tier: 'second', require_lc: 1, notes: null },
  { id: '3', name: 'Gamma SA', tier: 'weak', require_lc: 0, notes: 'small account' },
];

describe('CharterersTable column labels', () => {
  it('shows Name column header (not Company) — #503', () => {
    render(<CharterersTable charterers={SAMPLE} />);
    expect(screen.getByRole('columnheader', { name: /^name$/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^company$/i })).not.toBeInTheDocument();
  });

  it('shows Last Email Snippet column header (not LC Req.) — #503', () => {
    render(<CharterersTable charterers={SAMPLE} />);
    expect(screen.getByRole('columnheader', { name: /last email snippet/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /lc req/i })).not.toBeInTheDocument();
  });

  it('renders all rows', () => {
    render(<CharterersTable charterers={SAMPLE} />);
    expect(screen.getByText('Alpha Corp')).toBeInTheDocument();
    expect(screen.getByText('Beta Ltd')).toBeInTheDocument();
    expect(screen.getByText('Gamma SA')).toBeInTheDocument();
  });

  it('shows empty state when no charterers', () => {
    render(<CharterersTable charterers={[]} />);
    expect(screen.getByText(/no charterers found/i)).toBeInTheDocument();
  });

  // #520: Email column + headers visible even when empty
  it('shows Email column header', () => {
    render(<CharterersTable charterers={SAMPLE} />);
    expect(screen.getByRole('columnheader', { name: /^email$/i })).toBeInTheDocument();
  });

  it('shows table headers even when charterers list is empty', () => {
    render(<CharterersTable charterers={[]} />);
    expect(screen.getByRole('columnheader', { name: /^name$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^email$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
  });

  it('renders email when provided', () => {
    const withEmail: Charterer[] = [
      { id: '1', name: 'Alpha Corp', tier: 'blue-chip', require_lc: 0, notes: null, email: 'alpha@corp.com' },
    ];
    render(<CharterersTable charterers={withEmail} />);
    expect(screen.getByText('alpha@corp.com')).toBeInTheDocument();
  });
});
