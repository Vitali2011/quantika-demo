/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CiiRatingBadge } from '../CiiRatingBadge';

describe('CiiRatingBadge', () => {
  it('renders orange badge for rating D', () => {
    render(<CiiRatingBadge rating="D" year={2025} source="imo-public" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge).toHaveTextContent('CII D');
    expect(badge).toHaveClass('bg-orange-500');
  });

  it('renders red badge for rating E', () => {
    render(<CiiRatingBadge rating="E" year={2025} source="imo-public" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge).toHaveClass('bg-red-500');
  });

  it('renders green badge for rating A', () => {
    render(<CiiRatingBadge rating="A" year={2025} source="imo-public" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge).toHaveClass('bg-green-500');
  });

  it('renders gray badge for unknown rating', () => {
    render(<CiiRatingBadge rating="unknown" year={2025} source="llm-fallback" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge).toHaveClass('bg-gray-400');
  });

  it('has tooltip with year and source for imo-public', () => {
    render(<CiiRatingBadge rating="C" year={2025} source="imo-public" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge).toHaveAttribute('title', 'CII rating C (2025, source: imo-public)');
  });
});
