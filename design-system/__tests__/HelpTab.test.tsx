/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { HelpTab } from '../patterns/PaletteTabs/HelpTab';

describe('HelpTab', () => {
  it('shows prompt when query is short', () => {
    render(<HelpTab query="" />);
    expect(screen.getByText(/type your question/i)).toBeInTheDocument();
  });

  it('shows prompt when query is 2 chars', () => {
    render(<HelpTab query="ab" />);
    expect(screen.getByText(/type your question/i)).toBeInTheDocument();
  });

  it('shows loading skeleton when query ≥3 chars', () => {
    render(<HelpTab query="how" />);
    // Skeletons are aria-hidden, but loading state causes skeleton divs to render
    const skeletons = document.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
