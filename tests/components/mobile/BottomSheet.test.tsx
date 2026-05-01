/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BottomSheet } from '@/components/mobile/BottomSheet';

function noop() {}

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <BottomSheet open={false} onClose={noop}>
        <div>hidden</div>
      </BottomSheet>,
    );
    expect(container.querySelector('[data-testid="bottom-sheet"]')).toBeNull();
  });

  it('renders dialog with role and aria-modal when open', () => {
    render(
      <BottomSheet open onClose={noop} ariaLabel="Match details">
        <div>visible</div>
      </BottomSheet>,
    );
    const sheet = screen.getByRole('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.getAttribute('aria-label')).toBe('Match details');
  });

  it('renders children inside the sheet', () => {
    render(
      <BottomSheet open onClose={noop}>
        <div>hello-content</div>
      </BottomSheet>,
    );
    expect(screen.getByText('hello-content')).toBeTruthy();
  });

  it('uses default snap point 0.6', () => {
    render(
      <BottomSheet open onClose={noop}>
        <div>x</div>
      </BottomSheet>,
    );
    expect(screen.getByTestId('bottom-sheet').getAttribute('data-snap-point')).toBe('0.6');
  });

  it('honours snapPoint=0.3', () => {
    render(
      <BottomSheet open onClose={noop} snapPoint={0.3}>
        <div>x</div>
      </BottomSheet>,
    );
    expect(screen.getByTestId('bottom-sheet').getAttribute('data-snap-point')).toBe('0.3');
  });

  it('honours snapPoint=0.95', () => {
    render(
      <BottomSheet open onClose={noop} snapPoint={0.95}>
        <div>x</div>
      </BottomSheet>,
    );
    expect(screen.getByTestId('bottom-sheet').getAttribute('data-snap-point')).toBe('0.95');
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    render(
      <BottomSheet open onClose={onClose}>
        <div>x</div>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn();
    render(
      <BottomSheet open onClose={onClose}>
        <button>btn</button>
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses the first focusable element on open', () => {
    render(
      <BottomSheet open onClose={noop}>
        <button>first</button>
        <button>second</button>
      </BottomSheet>,
    );
    expect(document.activeElement?.textContent).toBe('first');
  });

  it('closes on swipe-down past 80px threshold', () => {
    const onClose = jest.fn();
    render(
      <BottomSheet open onClose={onClose}>
        <div>x</div>
      </BottomSheet>,
    );
    const handle = screen.getByTestId('bottom-sheet-handle');
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 250 }] });
    fireEvent.touchEnd(handle);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on small swipe-down (<80px)', () => {
    const onClose = jest.fn();
    render(
      <BottomSheet open onClose={onClose}>
        <div>x</div>
      </BottomSheet>,
    );
    const handle = screen.getByTestId('bottom-sheet-handle');
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 110 }] });
    fireEvent.touchEnd(handle);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('promotes snap point on swipe-up', () => {
    render(
      <BottomSheet open onClose={noop} snapPoint={0.3}>
        <div>x</div>
      </BottomSheet>,
    );
    const handle = screen.getByTestId('bottom-sheet-handle');
    act(() => {
      fireEvent.touchStart(handle, { touches: [{ clientY: 200 }] });
      fireEvent.touchMove(handle, { touches: [{ clientY: 50 }] });
      fireEvent.touchEnd(handle);
    });
    expect(screen.getByTestId('bottom-sheet').getAttribute('data-snap-point')).toBe('0.6');
  });
});
