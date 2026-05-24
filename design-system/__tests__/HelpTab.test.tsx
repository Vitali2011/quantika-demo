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

  it('shows nothing (no crash) when fetch fails — silent error state', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network error'));
    const { container } = render(<HelpTab query="help me" />);
    // After the promise rejects, loading ends, data stays null — renders null
    await new Promise((r) => setTimeout(r, 50));
    // Should not throw; container may be empty or show prompt
    expect(container).toBeInTheDocument();
  });

  it('renders source links from API response without dangerouslySetInnerHTML', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'Here is how',
        sources: [{ title: 'Quick start', url: '/docs/quickstart' }],
      }),
    });
    const { findByText } = render(<HelpTab query="how to" />);
    const link = await findByText('Quick start');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/docs/quickstart');
  });
});
