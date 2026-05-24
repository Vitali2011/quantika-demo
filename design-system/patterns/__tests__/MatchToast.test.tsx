/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MatchToast } from '../MatchToast';

describe('MatchToast', () => {
  it('renders match info when match provided', () => {
    render(
      <MatchToast
        match={{ match_id: 'm1', score: 94, vessel_name: 'MV Atlas', cargo_summary: 'HSS Constanta', createdAt: Date.now() }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/MV Atlas/)).toBeInTheDocument();
    expect(screen.getByText(/94/)).toBeInTheDocument();
  });

  it('null match → nothing rendered', () => {
    const { container } = render(<MatchToast match={null} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('auto-dismisses after 5s', () => {
    jest.useFakeTimers();
    const dismiss = jest.fn();
    render(
      <MatchToast
        match={{ match_id: 'm1', score: 94, createdAt: Date.now() }}
        onDismiss={dismiss}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(5100);
    });
    expect(dismiss).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('dismiss button calls onDismiss', () => {
    const dismiss = jest.fn();
    render(
      <MatchToast
        match={{ match_id: 'm2', score: 80, createdAt: Date.now() }}
        onDismiss={dismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(dismiss).toHaveBeenCalled();
  });

  it('shows match_id as fallback when no vessel_name', () => {
    render(
      <MatchToast
        match={{ match_id: 'abc123', score: 70, createdAt: Date.now() }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/match #abc123/)).toBeInTheDocument();
  });

  it('has role="status" for accessibility', () => {
    render(
      <MatchToast
        match={{ match_id: 'm3', score: 90, createdAt: Date.now() }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
