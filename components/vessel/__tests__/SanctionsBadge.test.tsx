/**
 * @jest-environment jsdom
 *
 * TDD: RED phase — SanctionsBadge component tests
 * PI2: Uses getByRole/getByText RTL queries, not innerHTML substring matching.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SanctionsBadge } from '../SanctionsBadge';

describe('SanctionsBadge', () => {
  it('renders SANCTIONS BLOCKED text', () => {
    render(<SanctionsBadge reason="IR-flagged vessel — OFAC/EU sanctions apply" />);
    expect(screen.getByText(/SANCTIONS BLOCKED/i)).toBeInTheDocument();
  });

  it('renders the reason text', () => {
    render(<SanctionsBadge reason="IR-flagged vessel — OFAC/EU sanctions apply" />);
    expect(screen.getByText(/IR-flagged vessel/i)).toBeInTheDocument();
  });

  it('has accessible role=alert and aria-label', () => {
    render(<SanctionsBadge reason="IR-flagged vessel — OFAC/EU sanctions apply" />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-label', expect.stringContaining('Sanctions'));
  });

  it('does not render when reason is not provided (empty string)', () => {
    const { container } = render(<SanctionsBadge reason="" />);
    expect(container.firstChild).toBeNull();
  });

  // Class 6 (substring leak): "OFAC" as part of a longer reason should still work correctly
  it('renders full reason text without truncation in aria-label', () => {
    const longReason = 'IR-flagged vessel — OFAC/EU sanctions apply (OFAC SDN list)';
    render(<SanctionsBadge reason={longReason} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-label', expect.stringContaining(longReason));
  });
});
