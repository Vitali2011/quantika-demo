/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Toast } from '../primitives/Toast';

describe('Toast (design-system)', () => {
  it('renders when open=true', () => {
    render(<Toast open>✨ Match saved</Toast>);
    expect(screen.getByRole('status')).toHaveTextContent('Match saved');
  });

  it('does not render when open=false', () => {
    render(<Toast open={false}>hidden</Toast>);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
