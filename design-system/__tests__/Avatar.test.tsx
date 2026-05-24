/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Avatar } from '../primitives/Avatar';

describe('Avatar (design-system)', () => {
  it('renders initials when no src', () => {
    render(<Avatar name="Boris Ivanov" />);
    expect(screen.getByText('BI')).toBeInTheDocument();
  });
});
