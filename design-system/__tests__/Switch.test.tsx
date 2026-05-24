/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Switch } from '../primitives/Switch';

describe('Switch (design-system)', () => {
  it('renders with switch role and correct aria attributes', () => {
    render(<Switch defaultChecked={false} aria-label="darkmode" />);
    const sw = screen.getByRole('switch');
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-label', 'darkmode');
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects checked state via aria-checked', () => {
    render(<Switch defaultChecked aria-label="enabled" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });
});
