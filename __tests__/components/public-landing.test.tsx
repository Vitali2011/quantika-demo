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

// Capture prefetch prop so the guard test can assert it
jest.mock('next/link', () => {
  return function MockLink({ children, href, prefetch, ...rest }: { children: React.ReactNode; href: string; prefetch?: boolean; [key: string]: unknown }) {
    return <a href={href} data-prefetch={String(prefetch)} {...rest}>{children}</a>;
  };
});

import { PublicLanding } from '@/components/PublicLanding';

describe('PublicLanding', () => {
  it('renders hero tagline', () => {
    render(<PublicLanding />);
    expect(screen.getByText(/Parses broker emails/i)).toBeInTheDocument();
  });

  it('renders CTA buttons', () => {
    render(<PublicLanding />);
    expect(screen.getByText(/Connect Gmail/i)).toBeInTheDocument();
    const demoLink = screen.getByRole('link', { name: /View demo/i });
    expect(demoLink).toHaveAttribute('href', '/login');
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

  it('Connect Gmail link has prefetch=false to prevent CORS-blocked RSC prefetch on /api/ route', () => {
    render(<PublicLanding />);
    const link = screen.getByRole('link', { name: /Connect Gmail/i });
    expect(link).toHaveAttribute('data-prefetch', 'false');
    expect(link).toHaveAttribute('href', '/api/auth/google');
  });
});
