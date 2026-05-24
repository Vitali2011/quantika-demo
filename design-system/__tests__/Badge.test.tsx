/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Badge } from '../primitives/Badge';

describe('Badge (design-system)', () => {
  it('renders text', () => {
    render(<Badge>94 match</Badge>);
    expect(screen.getByText('94 match')).toBeInTheDocument();
  });

  it('applies variant=success classes', () => {
    render(<Badge variant="success">ok</Badge>);
    expect(screen.getByText('ok')).toHaveClass('bg-ds-success-soft');
  });
});
