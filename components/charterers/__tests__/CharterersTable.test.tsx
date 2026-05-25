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
  it('shows Company column header (not NAME)', () => {
    render(<CharterersTable charterers={SAMPLE} />);
    expect(screen.getByRole('columnheader', { name: /company/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^name$/i })).not.toBeInTheDocument();
  });

  it('shows Last Contact column header (not LAST NOTE)', () => {
    render(<CharterersTable charterers={SAMPLE} />);
    expect(screen.getByRole('columnheader', { name: /last contact/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /last note/i })).not.toBeInTheDocument();
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
});
