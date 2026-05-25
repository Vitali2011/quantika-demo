/**
 * @jest-environment jsdom
 *
 * Behavioral tests for the generic toast system.
 * PI2: exercises real rendering — ToastProvider + useToast() + ToastContainer.
 */
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, ToastContainer, useToast } from '@/components/ui/toast';

function ToastTrigger({ variant, message }: { variant: 'success' | 'error' | 'info'; message: string }) {
  const toast = useToast();
  return (
    <button onClick={() => toast[variant](message)}>
      show toast
    </button>
  );
}

function TestApp({ variant = 'success', message = 'Test message' }: { variant?: 'success' | 'error' | 'info'; message?: string }) {
  return (
    <ToastProvider>
      <ToastTrigger variant={variant} message={message} />
      <ToastContainer />
    </ToastProvider>
  );
}

describe('useToast + ToastContainer', () => {
  it('toast.success() renders success toast with message', async () => {
    render(<TestApp variant="success" message="Settings saved" />);
    await userEvent.click(screen.getByRole('button', { name: 'show toast' }));
    expect(screen.getByRole('status')).toHaveTextContent('Settings saved');
  });

  it('toast.error() renders error toast', async () => {
    render(<TestApp variant="error" message="Failed to save" />);
    await userEvent.click(screen.getByRole('button', { name: 'show toast' }));
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Failed to save');
    expect(el).toHaveAttribute('data-variant', 'error');
  });

  it('toast.info() renders info toast', async () => {
    render(<TestApp variant="info" message="Emails parsed" />);
    await userEvent.click(screen.getByRole('button', { name: 'show toast' }));
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Emails parsed');
    expect(el).toHaveAttribute('data-variant', 'info');
  });

  it('dismiss button removes toast', async () => {
    render(<TestApp variant="success" message="Dismissable" />);
    await userEvent.click(screen.getByRole('button', { name: 'show toast' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('toast.action() renders action button', async () => {
    function ActionApp() {
      const toast = useToast();
      return (
        <ToastProvider>
          <button onClick={() => toast.action('Undo this?', { label: 'Undo', onClick: jest.fn() })}>
            show action toast
          </button>
          <ToastContainer />
        </ToastProvider>
      );
    }
    // action toast needs ToastProvider wrapping the component calling useToast
    function WrappedActionApp() {
      return (
        <ToastProvider>
          <ActionButton />
          <ToastContainer />
        </ToastProvider>
      );
    }
    function ActionButton() {
      const toast = useToast();
      return (
        <button onClick={() => toast.action('Undo this?', { label: 'Undo', onClick: jest.fn() })}>
          show action toast
        </button>
      );
    }
    render(<WrappedActionApp />);
    await userEvent.click(screen.getByRole('button', { name: 'show action toast' }));
    expect(screen.getByRole('status')).toHaveTextContent('Undo this?');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('auto-dismisses after DURATION_MS', () => {
    jest.useFakeTimers();
    render(<TestApp variant="success" message="Auto-dismiss" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'show toast' })); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(4001); });
    expect(screen.queryByRole('status')).toBeNull();
    jest.useRealTimers();
  });

  it('useToast throws when used outside ToastProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow('useToast must be used within ToastProvider');
    spy.mockRestore();
  });
});
