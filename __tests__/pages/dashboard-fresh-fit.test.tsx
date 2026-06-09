/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DashboardFreshMatches } from '@/components/dashboard/DashboardFreshMatches';

it('renders fit_percent as "N% fit" when present (matches list rule)', () => {
  render(<DashboardFreshMatches matches={[
    { id: 1, score: 88, fit_percent: 73.4, matchLevel: 'good', matchReasons: ['r'] },
  ]} />);
  expect(screen.getByText('73% fit')).toBeInTheDocument();
  expect(screen.queryByText('88')).not.toBeInTheDocument();
});

it('falls back to raw score when fit_percent is null', () => {
  render(<DashboardFreshMatches matches={[
    { id: 2, score: 88, fit_percent: null, matchLevel: 'good', matchReasons: ['r'] },
  ]} />);
  expect(screen.getByText('88')).toBeInTheDocument();
});
