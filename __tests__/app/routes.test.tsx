/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoutesPage from '../../app/routes/page';

// Minimal Next.js Link stub
jest.mock('next/link', () => {
  const MockLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'Link';
  return MockLink;
});

describe('/routes page', () => {
  it('renders without crashing', () => {
    render(<RoutesPage />);
  });

  it('shows Supramax and Capesize sections', () => {
    render(<RoutesPage />);
    expect(screen.getByText(/Supramax/i)).toBeInTheDocument();
    expect(screen.getByText(/Capesize/i)).toBeInTheDocument();
  });

  it('shows known route codes', () => {
    render(<RoutesPage />);
    expect(screen.getByText('S1B')).toBeInTheDocument();
    expect(screen.getByText('S4A')).toBeInTheDocument();
    expect(screen.getByText('C2')).toBeInTheDocument();
    expect(screen.getByText('C5')).toBeInTheDocument();
  });

  it('contains a back link to /market', () => {
    render(<RoutesPage />);
    const backLink = screen.getByRole('link', { name: /← Market/i });
    expect(backLink).toHaveAttribute('href', '/market');
  });
});

describe('RoutesSection link', () => {
  it('RoutesSection links to /routes not /market#routes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/market/RoutesSection.tsx'),
      'utf-8'
    );
    expect(src).toContain('href="/routes"');
    expect(src).not.toContain('href="/market#routes"');
  });
});
