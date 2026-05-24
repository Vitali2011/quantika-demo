/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { Skeleton } from '../primitives/Skeleton';

describe('Skeleton (design-system)', () => {
  it('renders with animate-pulse class', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });
});
