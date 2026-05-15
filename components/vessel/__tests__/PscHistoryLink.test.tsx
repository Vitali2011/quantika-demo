/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PscHistoryLink } from '../PscHistoryLink';

describe('PscHistoryLink', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('renders a link to /vessels/{imo}/psc-history when flag is enabled', () => {
    process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED = 'true';
    render(<PscHistoryLink imo="9322180" />);

    const link = screen.getByRole('link', { name: /psc history/i });
    expect(link).toHaveAttribute('href', '/vessels/9322180/psc-history');
  });

  it('renders nothing when the flag is unset', () => {
    delete process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED;
    const { container } = render(<PscHistoryLink imo="9322180" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the flag is explicitly "false"', () => {
    process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED = 'false';
    const { container } = render(<PscHistoryLink imo="9322180" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when imo is empty', () => {
    process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED = 'true';
    const { container } = render(<PscHistoryLink imo="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when imo is null', () => {
    process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED = 'true';
    const { container } = render(<PscHistoryLink imo={null} />);
    expect(container.firstChild).toBeNull();
  });
});
