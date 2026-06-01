/**
 * @jest-environment jsdom
 *
 * TDD #606 R2 — /cargo table column visibility regression
 *
 * Reproduces: CARGO td grows to 1782px with table-layout:auto, hiding all other columns.
 * Fix: table must use table-layout:fixed (Tailwind: `table-fixed`) so colgroup widths are enforced.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import CargoClient, { type CargoRow } from '@/app/cargo/CargoClient';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/cargo',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/design-system/patterns/useMode', () => ({
  useMode: () => ({ isCharterer: true, mode: 'charterer', setMode: jest.fn() }),
}));

function makeRow(i: number): CargoRow {
  return {
    id: `id-${i}`,
    emailId: `email-${i}`,
    itemIndex: i,
    commodity: `Iron Ore Fines Extra Long Commodity Name That Could Overflow ${i}`,
    cargoType: 'bulk',
    commodityKey: 'bulk',
    originPort: `Port Of ${i}`,
    destinationPort: `Discharge Port ${i}`,
    quantity: `${10000 + i} mt`,
    laycan: 'Jun 2026',
    status: 'open',
    sourceTag: 'Email',
    sourceName: `Source ${i}`,
  };
}

const ROWS_80: CargoRow[] = Array.from({ length: 80 }, (_, i) => makeRow(i));

describe('/cargo table column layout (#606 R2)', () => {
  it('TDD-1: table uses table-fixed layout to prevent CARGO column overflow', () => {
    render(<CargoClient rows={ROWS_80} total={80} />);
    const table = document.querySelector('[role="grid"]');
    expect(table).toBeTruthy();
    // table-fixed enforces colgroup widths; without it CARGO td expands to 1782px
    expect(table!.className).toContain('table-fixed');
  });

  it('TDD-2: all 7 column headers visible with 80 rows (CARGO/QTY/LOAD/DISCHARGE/LAYCAN/STATUS/SOURCE)', () => {
    render(<CargoClient rows={ROWS_80} total={80} />);
    const theadTexts = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent ?? '');
    expect(theadTexts).toEqual(expect.arrayContaining(['Cargo', 'Qty', 'Load', 'Discharge', 'Laycan', 'Status', 'Source']));
  });

  it('TDD-3: CARGO td has max-w constraint to prevent overflow into other columns', () => {
    render(<CargoClient rows={ROWS_80} total={80} />);
    const firstBodyRow = document.querySelector('tbody tr');
    expect(firstBodyRow).toBeTruthy();
    const cargotd = firstBodyRow!.querySelector('td:first-child');
    expect(cargotd).toBeTruthy();
    // must have overflow control — either truncate, overflow-hidden, or max-w-[220px]
    expect(cargotd!.className).toMatch(/truncate|overflow-hidden|max-w-\[220px\]/);
  });

  it('TDD-4: QTY td has min-w so range quantities like "45,000–60,000" do not overflow into LOAD (#734)', () => {
    const rangeRow: CargoRow = {
      ...makeRow(0),
      quantity: '45,000–60,000 mt',
    };
    render(<CargoClient rows={[rangeRow]} total={1} />);
    const firstBodyRow = document.querySelector('tbody tr');
    expect(firstBodyRow).toBeTruthy();
    // QTY is the 2nd td (index 1)
    const qtytd = firstBodyRow!.querySelectorAll('td')[1];
    expect(qtytd).toBeTruthy();
    // must have a min-w class to prevent range values from overlapping LOAD column
    expect(qtytd!.className).toMatch(/min-w-\[/);
  });
});
