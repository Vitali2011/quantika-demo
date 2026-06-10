/**
 * @jest-environment jsdom
 *
 * Task G: bracketData rendered as grey brackets in MatchDetailPanel.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MatchDetailPanel } from '../MatchDetailPanel';

jest.mock('@/lib/csrf-client', () => ({
  csrfFetch: jest.fn(),
}));

const baseProps = {
  matchDbId: 1,
  score: 0,
  status: 'new',
  hasSessionMatch: false,
};

it('renders bracketData in grey brackets when present', () => {
  const fb = JSON.stringify({
    components: [
      { label: 'Ballast distance', weight: 15, score: 9, rationale: 'x', bracketData: '~2,100 nm' },
    ],
    totalWeight: 100,
    sanctionsPenalty: 0,
    appliedCap: null,
  });
  render(<MatchDetailPanel {...baseProps} fitPercent={60} fitBreakdown={fb} />);
  expect(screen.getByText('[~2,100 nm]')).toBeInTheDocument();
});

it('does not render bracket span when bracketData is absent', () => {
  const fb = JSON.stringify({
    components: [
      { label: 'Class fit', weight: 9, score: 9, rationale: 'y' },
    ],
    totalWeight: 100,
    sanctionsPenalty: 0,
    appliedCap: null,
  });
  render(<MatchDetailPanel {...baseProps} fitPercent={90} fitBreakdown={fb} />);
  // label present but no bracket content
  expect(screen.getByText('Class fit')).toBeInTheDocument();
  expect(screen.queryByText(/^\[.*\]$/)).not.toBeInTheDocument();
});
