/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { NavigateTab } from '../patterns/PaletteTabs/NavigateTab';

it('NavigateTab lists routes', () => {
  render(<NavigateTab query="" onSelect={() => {}} />);
  expect(screen.getByText('Matches')).toBeInTheDocument();
  expect(screen.getByText('Cargo')).toBeInTheDocument();
});

it('filters by query', () => {
  render(<NavigateTab query="set" onSelect={() => {}} />);
  expect(screen.getByText('Settings')).toBeInTheDocument();
  expect(screen.queryByText('Matches')).toBeNull();
});

it('shows empty state when no match', () => {
  render(<NavigateTab query="zzznomatch" onSelect={() => {}} />);
  expect(screen.getByText(/no matching pages/i)).toBeInTheDocument();
});
