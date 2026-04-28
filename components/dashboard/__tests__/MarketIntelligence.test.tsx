/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MarketIntelligence } from '../MarketIntelligence';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
  } as unknown as Response);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('MarketIntelligence', () => {
  it('renders without crashing', () => {
    const { container } = render(<MarketIntelligence />);
    expect(container).not.toBeNull();
  });

  it('shows Toepfer TMI KPI', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/Toepfer TMI/i)).toBeTruthy();
  });

  it('shows Bunker Rotterdam KPI', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/Bunker Rotterdam/i)).toBeTruthy();
  });

  it('shows EUA KPI', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/EUA/i)).toBeTruthy();
  });

  it('shows BHSI KPI', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/BHSI/i)).toBeTruthy();
  });

  it('shows empty-state suggestion when no active deals', () => {
    render(<MarketIntelligence noActiveDeals />);
    expect(screen.getByText(/WhatsApp|Gmail/i)).toBeTruthy();
  });
});
