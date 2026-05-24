/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Card } from '../primitives/Card';

describe('Card (design-system)', () => {
  it('renders children with surface bg', () => {
    render(<Card><div>content</div></Card>);
    const card = screen.getByText('content').parentElement!;
    expect(card).toHaveClass('bg-ds-surface');
  });
});
