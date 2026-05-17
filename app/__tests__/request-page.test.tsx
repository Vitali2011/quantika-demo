/**
 * @jest-environment jsdom
 *
 * Contract tests for /request — deal request page.
 * Spec ref: week-C-stubs Phase 1 scope — request page content
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

import RequestPage from '@/app/request/page';

describe('/request deal request page', () => {
  test('renders "Request a New Deal" heading', () => {
    render(<RequestPage />);
    expect(
      screen.getByRole('heading', { name: /Request a New Deal/i })
    ).toBeInTheDocument();
  });

  test('CTA link has href="mailto:sales@quantika.org"', () => {
    render(<RequestPage />);
    const link = screen.getByRole('link', { name: /contact sales/i });
    expect(link).toHaveAttribute('href', 'mailto:sales@quantika.org');
  });

  test('back-link has href="/dashboard"', () => {
    render(<RequestPage />);
    const link = screen.getByRole('link', { name: /back to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });
});
