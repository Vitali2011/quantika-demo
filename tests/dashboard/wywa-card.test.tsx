/**
 * β-15: While You Were Away digest card.
 *
 * Assert-budget: ≤30 expects.
 *
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { WhileYouWereAwayCard } from '@/components/dashboard/WhileYouWereAwayCard';

describe('β-15 WhileYouWereAwayCard', () => {
  it('renders summary when there are pending drafts', () => {
    render(
      <WhileYouWereAwayCard
        pendingDrafts={5}
        voiceMemosProcessed={2}
        errors={1}
      />,
    );
    expect(screen.getByTestId('wywa-card')).toBeInTheDocument();
    expect(screen.getByText(/5 drafts awaiting approval/i)).toBeInTheDocument();
    expect(screen.getByText(/2 voice memos/i)).toBeInTheDocument();
    expect(screen.getByText(/1 error/i)).toBeInTheDocument();
  });

  it('hides itself when there are 0 pending drafts', () => {
    const { container } = render(
      <WhileYouWereAwayCard pendingDrafts={0} voiceMemosProcessed={0} errors={0} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('wywa-card')).not.toBeInTheDocument();
  });

  it('singularises labels for count of 1', () => {
    render(
      <WhileYouWereAwayCard pendingDrafts={1} voiceMemosProcessed={1} errors={0} />,
    );
    expect(screen.getByText(/1 draft awaiting approval/i)).toBeInTheDocument();
    expect(screen.getByText(/1 voice memo/i)).toBeInTheDocument();
  });
});
