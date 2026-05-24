/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../primitives/Button';

describe('Button (design-system)', () => {
  it('renders children and fires onClick', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick} disabled>Save</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies variant=primary classes', () => {
    render(<Button variant="primary">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-ds-accent');
  });

  it('applies size=sm classes', () => {
    render(<Button size="sm">x</Button>);
    expect(screen.getByRole('button').className).toMatch(/text-xs|h-7/);
  });
});
