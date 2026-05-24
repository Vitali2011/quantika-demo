/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { LiveStripCard } from '../LiveStripCard';

describe('LiveStripCard', () => {
  it('renders queue state with from/subject', () => {
    render(<LiveStripCard from="Boris" subject="HSS cargo" status="queue" />);
    expect(screen.getByText('Boris')).toBeInTheDocument();
    expect(screen.getByText('HSS cargo')).toBeInTheDocument();
    expect(screen.getByText('queue')).toBeInTheDocument();
  });

  it('renders active state', () => {
    render(<LiveStripCard from="Alice" subject="Grain Odessa" status="active" />);
    expect(screen.getByText(/processing/)).toBeInTheDocument();
  });

  it('renders done state with matchHint', () => {
    render(<LiveStripCard from="Boris" subject="HSS" status="done" matchHint="MV Atlas 94" />);
    expect(screen.getByText(/MV Atlas 94/)).toBeInTheDocument();
  });

  it('renders done state with default "done" when no matchHint', () => {
    render(<LiveStripCard from="Boris" subject="HSS" status="done" />);
    expect(screen.getByText(/✓ done/)).toBeInTheDocument();
  });
});
