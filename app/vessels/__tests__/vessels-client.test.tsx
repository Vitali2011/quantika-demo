/**
 * @jest-environment jsdom
 *
 * Behavioral tests for VesselsClient — row click → side-modal (#629).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/design-system/patterns/useMode', () => ({
  useMode: () => ({
    mode: 'owner',
    isCharterer: false,
    isOwner: true,
    setMode: jest.fn(),
    t: (k: string) => k,
  }),
}));

jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

import VesselsClient, { type VesselRow } from '../VesselsClient';

const sampleRows: VesselRow[] = [
  {
    id: 'e1:0',
    emailId: 'e1',
    itemIndex: 0,
    vesselName: 'MV Atlantic Star',
    vesselType: 'Bulk Carrier',
    vesselKey: 'bulk',
    dwtSummer: '75,000',
    openPosition: 'Rotterdam',
    openDate: '01 Jun 2026',
    status: 'open',
    sourceTag: 'Email',
    sourceName: 'Nordic Shipowners',
  },
  {
    id: 'e2:0',
    emailId: 'e2',
    itemIndex: 0,
    vesselName: 'MT Ocean Pride',
    vesselType: 'Tanker',
    vesselKey: 'tanker',
    dwtSummer: '110,000',
    openPosition: 'Singapore',
    openDate: '15 Jun 2026',
    status: 'match',
    sourceTag: 'Email',
    sourceName: 'Gulf Tankers',
  },
];

describe('VesselsClient', () => {
  it('renders the Vessels heading with item count', () => {
    render(<VesselsClient rows={sampleRows} total={2} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Vessels');
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('renders vessel rows in the table', () => {
    render(<VesselsClient rows={sampleRows} total={2} />);
    expect(screen.getByText('MV Atlantic Star')).toBeInTheDocument();
    expect(screen.getByText('MT Ocean Pride')).toBeInTheDocument();
  });

  // PI2 behavioral — row click opens side-modal (#629)
  it('opens side panel with role=dialog when a row is clicked', () => {
    render(<VesselsClient rows={sampleRows} total={2} />);
    const rows = screen.getAllByRole('row');
    // rows[0] is thead, rows[1] is first tbody row
    fireEvent.click(rows[1]);
    const panel = screen.getByRole('dialog', { name: /Vessel detail/i });
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('MV Atlantic Star');
  });

  it('side panel has aria-modal="true"', () => {
    render(<VesselsClient rows={sampleRows} total={2} />);
    const rows = screen.getAllByRole('row');
    fireEvent.click(rows[1]);
    const panel = screen.getByRole('dialog', { name: /Vessel detail/i });
    expect(panel).toHaveAttribute('aria-modal', 'true');
  });

  it('closes side panel when close button is clicked', () => {
    render(<VesselsClient rows={sampleRows} total={2} />);
    const rows = screen.getAllByRole('row');
    fireEvent.click(rows[1]);
    expect(screen.getByRole('dialog', { name: /Vessel detail/i })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(screen.queryByRole('dialog', { name: /Vessel detail/i })).not.toBeInTheDocument();
  });

  it('shows empty state when no vessels', () => {
    render(<VesselsClient rows={[]} total={0} />);
    expect(screen.getByText(/No vessels found/i)).toBeInTheDocument();
  });

  it('filters rows by search text', () => {
    render(<VesselsClient rows={sampleRows} total={2} />);
    const searchInput = screen.getByLabelText('Search vessels');
    fireEvent.change(searchInput, { target: { value: 'atlantic' } });
    expect(screen.getByText('MV Atlantic Star')).toBeInTheDocument();
    expect(screen.queryByText('MT Ocean Pride')).not.toBeInTheDocument();
  });
});
