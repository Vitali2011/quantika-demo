/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { LiveStrip } from '../LiveStrip';

describe('LiveStrip', () => {
  it('hidden when no jobs (returns null)', () => {
    const { container } = render(<LiveStrip jobs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('visible with progress when 1+ jobs', () => {
    render(
      <LiveStrip
        jobs={[
          { id: 'j1', status: 'processing', progress_percent: 50, from: 'Boris', email_subject: 'HSS cargo' },
        ]}
      />,
    );
    expect(screen.getByText(/Boris/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows correct done/total count', () => {
    render(
      <LiveStrip
        jobs={[
          { id: 'j1', status: 'processing', progress_percent: 50 },
          { id: 'j2', status: 'done', progress_percent: 100 },
        ]}
      />,
    );
    expect(screen.getByText(/1\/2 готово/)).toBeInTheDocument();
  });

  it('aria-label is "Live email processing"', () => {
    render(<LiveStrip jobs={[{ id: 'j1', status: 'processing', progress_percent: 30 }]} />);
    expect(screen.getByRole('region', { name: /live email processing/i })).toBeInTheDocument();
  });

  it('renders at most 5 cards', () => {
    const jobs = Array.from({ length: 8 }, (_, i) => ({
      id: `j${i}`,
      status: 'processing',
      progress_percent: 30,
      from: `Sender${i}`,
      email_subject: `Subject ${i}`,
    }));
    render(<LiveStrip jobs={jobs} />);
    // Only first 5 senders should appear
    expect(screen.getByText('Sender0')).toBeInTheDocument();
    expect(screen.getByText('Sender4')).toBeInTheDocument();
    expect(screen.queryByText('Sender5')).not.toBeInTheDocument();
  });
});
