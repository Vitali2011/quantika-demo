/**
 * @jest-environment jsdom
 *
 * Regression test for #636: long multi-word region names must not overflow into
 * adjacent columns. Load and Discharge cells must have break-words, not whitespace-nowrap.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/design-system/patterns/useMode', () => ({
  useMode: () => ({
    mode: 'charterer',
    isCharterer: true,
    isOwner: false,
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

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

import CargoClient, { type CargoRow } from '@/app/cargo/CargoClient';

const LONG_ORIGIN = 'Eastern Mediterranean Western Mediterranean port';
const LONG_DEST = 'Northern European Atlantic Continental shelf port';

const longRegionRow: CargoRow = {
  id: 'wrap:0',
  emailId: 'wrap-email',
  itemIndex: 0,
  commodity: 'Grain',
  cargoType: 'BULK',
  commodityKey: 'grain',
  originPort: LONG_ORIGIN,
  destinationPort: LONG_DEST,
  quantity: '50k MT',
  laycan: '01–15 Jul',
  status: 'open',
  sourceTag: 'Email',
  sourceName: 'AgriTrade',
};

describe('cargo table — long region name wrap (#636)', () => {
  it('renders the full long origin port text without truncation', () => {
    render(<CargoClient rows={[longRegionRow]} total={1} />);
    expect(screen.getByText(LONG_ORIGIN)).toBeInTheDocument();
  });

  it('renders the full long destination port text without truncation', () => {
    render(<CargoClient rows={[longRegionRow]} total={1} />);
    expect(screen.getByText(LONG_DEST)).toBeInTheDocument();
  });

  it('Load cell has break-words class and no whitespace-nowrap', () => {
    render(<CargoClient rows={[longRegionRow]} total={1} />);
    const originText = screen.getByText(LONG_ORIGIN);
    const td = originText.closest('td');
    expect(td).not.toBeNull();
    expect(td!.className).toMatch(/break-words/);
    expect(td!.className).not.toMatch(/whitespace-nowrap/);
  });

  it('Discharge cell has break-words class and no whitespace-nowrap', () => {
    render(<CargoClient rows={[longRegionRow]} total={1} />);
    const destText = screen.getByText(LONG_DEST);
    const td = destText.closest('td');
    expect(td).not.toBeNull();
    expect(td!.className).toMatch(/break-words/);
    expect(td!.className).not.toMatch(/whitespace-nowrap/);
  });

  it('Laycan cell has no whitespace-nowrap (allows 2-line wrap)', () => {
    render(<CargoClient rows={[longRegionRow]} total={1} />);
    const laycanText = screen.getByText('01–15 Jul');
    const td = laycanText.closest('td');
    expect(td).not.toBeNull();
    expect(td!.className).not.toMatch(/whitespace-nowrap/);
  });
});
