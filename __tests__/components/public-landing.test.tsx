/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// LiveStrip uses KpiCard (client component with useEffect/fetch) — stub at the module level
jest.mock('@/components/market/LiveStrip', () => ({
  LiveStrip: () => <div data-testid="live-strip-stub" />,
}));

import { PublicLanding } from '@/components/PublicLanding';

describe('PublicLanding', () => {
  it('renders hero tagline', () => {
    render(<PublicLanding />);
    expect(screen.getByText(/Parses broker emails/i)).toBeInTheDocument();
  });

  it('renders CTA buttons', () => {
    render(<PublicLanding />);
    expect(screen.getByText(/Connect Gmail/i)).toBeInTheDocument();
    expect(screen.getByText(/Try with sample data/i)).toBeInTheDocument();
  });

  it('renders 3 feature cards', () => {
    render(<PublicLanding />);
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(3);
  });

  it('renders trust logos for all four companies', () => {
    render(<PublicLanding />);
    for (const name of ['Norden', 'Glencore', 'Cargill', 'Bunge']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('renders market strip placeholder', () => {
    render(<PublicLanding />);
    expect(screen.getByTestId('live-strip-stub')).toBeInTheDocument();
  });
});
