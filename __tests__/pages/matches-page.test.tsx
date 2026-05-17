/**
 * @jest-environment jsdom
 *
 * UX cleanup bundle: /matches "Coming soon" placeholder.
 * Audit 2026-05-13 (F3) — /matches redirected to /dashboard with no listing.
 * Since /api/matches doesn't exist, we replace the redirect with a placeholder
 * + link back to /dashboard. No new endpoint is created.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

import MatchesPage from '@/app/matches/page';

describe('/matches placeholder page', () => {
  test('renders "Your Recent Matches" heading', () => {
    render(<MatchesPage />);
    expect(screen.getByRole('heading', { name: /Your Recent Matches/i })).toBeInTheDocument();
  });

  test('exposes CTA link to /request', () => {
    render(<MatchesPage />);
    const link = screen.getByRole('link', { name: /submit your first deal request/i });
    expect(link).toHaveAttribute('href', '/request');
  });
});
