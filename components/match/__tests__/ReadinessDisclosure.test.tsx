/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReadinessDisclosure } from '../ReadinessDisclosure';
import type { WorksheetReadiness } from '@/lib/types';

const r: WorksheetReadiness = {
  verdict: 'ideal', openDate: '2026-07-01', openPosition: 'Rotterdam',
  laycanStart: '2026-07-05', laycanEnd: '2026-07-10',
  distanceNm: 1200, sailingDays: 5.2, speedKn: 12.5, arrivalDate: '2026-07-06',
  gapDays: 1, explanation: '',
};

test('collapsed by default, expands on click', () => {
  render(<ReadinessDisclosure readiness={r} />);
  expect(screen.queryByText(/2026-07-06/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('readiness-detail-toggle'));
  expect(screen.getByTestId('readiness-detail-body')).toBeInTheDocument();
});

test('shows arrival date and laycan when expanded', () => {
  render(<ReadinessDisclosure readiness={r} />);
  fireEvent.click(screen.getByTestId('readiness-detail-toggle'));
  expect(screen.getByTestId('readiness-detail-body')).toHaveTextContent('2026-07-06');
  expect(screen.getByTestId('readiness-detail-body')).toHaveTextContent('2026-07-05');
});

test('unknown verdict → shows "no timing data" message', () => {
  render(<ReadinessDisclosure readiness={{ ...r, verdict: 'unknown', gapDays: null, arrivalDate: null }} />);
  fireEvent.click(screen.getByTestId('readiness-detail-toggle'));
  expect(screen.getByTestId('readiness-detail-body')).toHaveTextContent(/no timing data/i);
});
