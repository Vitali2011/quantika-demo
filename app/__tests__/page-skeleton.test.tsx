/**
 * @jest-environment jsdom
 *
 * Phase 2a — test-author persona (cold context).
 * Contract: PageSkeleton renders animate-pulse loading state.
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

import PageSkeleton from '@/components/ui/PageSkeleton';

describe('PageSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<PageSkeleton />);
    expect(container.firstChild).not.toBeNull();
  });

  it('has animate-pulse class for loading animation', () => {
    const { container } = render(<PageSkeleton />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renders at least one grey placeholder block', () => {
    const { container } = render(<PageSkeleton />);
    const greyBlocks = container.querySelectorAll('[class*="bg-gray"]');
    expect(greyBlocks.length).toBeGreaterThan(0);
  });
});
