/**
 * @jest-environment jsdom
 *
 * W6b I13: CII llm-fallback source must render CII D* (asterisk + "Estimated by AI" tooltip)
 * so users see that the rating was AI-estimated, not from the official IMO dataset.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CiiRatingBadge } from '@/components/vessel/CiiRatingBadge';

describe('CiiRatingBadge — llm-fallback asterisk', () => {
  it('renders CII D* for llm-fallback source (asterisk present)', () => {
    render(<CiiRatingBadge rating="D" year={2025} source="llm-fallback" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge).toHaveTextContent('CII D*');
  });

  it('renders CII E* for llm-fallback source', () => {
    render(<CiiRatingBadge rating="E" year={2025} source="llm-fallback" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge).toHaveTextContent('CII E*');
  });

  it('does NOT add asterisk for imo-public source', () => {
    render(<CiiRatingBadge rating="D" year={2025} source="imo-public" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge).toHaveTextContent('CII D');
    expect(badge.textContent).toBe('CII D');
  });

  it('does NOT add asterisk for cache source', () => {
    render(<CiiRatingBadge rating="C" year={2025} source="cache" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge.textContent).toBe('CII C');
  });

  it('tooltip contains "Estimated by AI" for llm-fallback', () => {
    render(<CiiRatingBadge rating="D" year={2025} source="llm-fallback" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge).toHaveAttribute('title', expect.stringContaining('Estimated by AI'));
  });

  it('tooltip does NOT contain "Estimated by AI" for imo-public', () => {
    render(<CiiRatingBadge rating="D" year={2025} source="imo-public" />);
    const badge = screen.getByTestId('cii-rating-badge');
    expect(badge.getAttribute('title')).not.toContain('Estimated by AI');
  });
});
