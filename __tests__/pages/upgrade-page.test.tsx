/**
 * @jest-environment jsdom
 *
 * UX cleanup bundle: /upgrade placeholder page.
 * Audit 2026-05-13 (browser-walkthrough, F-?) — TrialBanner linked to /upgrade,
 * route was 404. Minimal placeholder with mailto contact.
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

import UpgradePage from '@/app/upgrade/page';

describe('/upgrade placeholder page', () => {
  test('renders heading', () => {
    render(<UpgradePage />);
    expect(screen.getByRole('heading', { name: /апгрейд|upgrade/i })).toBeInTheDocument();
  });

  test('exposes mailto link to hello@quantika.org', () => {
    render(<UpgradePage />);
    const link = screen.getByRole('link', { name: /hello@quantika\.org|связаться|contact/i });
    expect(link).toHaveAttribute('href', 'mailto:hello@quantika.org');
  });
});
