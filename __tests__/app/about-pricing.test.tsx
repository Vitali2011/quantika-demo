/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/link', () => {
  const MockLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'Link';
  return MockLink;
});

import AboutPage from '../../app/about/page';
import PricingPage from '../../app/pricing/page';

describe('/about page', () => {
  it('renders without crashing', () => {
    render(<AboutPage />);
  });

  it('displays Quantika heading', () => {
    render(<AboutPage />);
    expect(screen.getByRole('heading', { name: /About Quantika/i })).toBeInTheDocument();
  });

  it('contains link to /pricing', () => {
    render(<AboutPage />);
    const link = screen.getByRole('link', { name: /Pricing/i });
    expect(link).toHaveAttribute('href', '/pricing');
  });

  it('contains contact email link', () => {
    render(<AboutPage />);
    const contactLink = screen.getByRole('link', { name: /Contact us/i });
    expect(contactLink).toHaveAttribute('href', 'mailto:hello@quantika.org');
  });
});

describe('/pricing page', () => {
  it('renders without crashing', () => {
    render(<PricingPage />);
  });

  it('displays pricing heading', () => {
    render(<PricingPage />);
    expect(screen.getByRole('heading', { name: /pricing/i, level: 1 })).toBeInTheDocument();
  });

  it('shows three plan tiers', () => {
    render(<PricingPage />);
    expect(screen.getByRole('heading', { name: /Starter/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pro/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Enterprise/i })).toBeInTheDocument();
  });

  it('contains link to /about', () => {
    render(<PricingPage />);
    const link = screen.getByRole('link', { name: /About/i });
    expect(link).toHaveAttribute('href', '/about');
  });
});

describe('middleware bypass for /about and /pricing', () => {
  it('/about is in AUTH_BYPASS_PATHS', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../middleware.ts'),
      'utf-8'
    );
    expect(src).toContain("'/about'");
    expect(src).toContain("'/pricing'");
  });
});
