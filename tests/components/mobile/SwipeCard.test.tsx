/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SwipeCard } from '@/components/mobile/SwipeCard';

beforeEach(() => {
  Object.defineProperty(navigator, 'vibrate', {
    value: jest.fn().mockReturnValue(true),
    configurable: true,
    writable: true,
  });
});

function swipe(el: HTMLElement, fromX: number, toX: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: fromX, clientY: 0 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: toX, clientY: 0 }] });
  fireEvent.touchEnd(el);
}

describe('SwipeCard', () => {
  it('renders children', () => {
    render(<SwipeCard>content-1</SwipeCard>);
    expect(screen.getByText('content-1')).toBeTruthy();
  });

  it('calls onSwipeRight on swipe past +threshold', () => {
    const onSwipeRight = jest.fn();
    render(<SwipeCard onSwipeRight={onSwipeRight}>x</SwipeCard>);
    swipe(screen.getByTestId('swipe-card'), 0, 120);
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('calls onSwipeLeft on swipe past -threshold', () => {
    const onSwipeLeft = jest.fn();
    render(<SwipeCard onSwipeLeft={onSwipeLeft}>x</SwipeCard>);
    swipe(screen.getByTestId('swipe-card'), 200, 50);
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it('does not fire callbacks below threshold', () => {
    const onSwipeRight = jest.fn();
    const onSwipeLeft = jest.fn();
    render(
      <SwipeCard onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
        x
      </SwipeCard>,
    );
    swipe(screen.getByTestId('swipe-card'), 0, 30);
    swipe(screen.getByTestId('swipe-card'), 0, -30);
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('respects custom threshold', () => {
    const onSwipeRight = jest.fn();
    render(
      <SwipeCard onSwipeRight={onSwipeRight} threshold={200}>
        x
      </SwipeCard>,
    );
    swipe(screen.getByTestId('swipe-card'), 0, 150);
    expect(onSwipeRight).not.toHaveBeenCalled();
    swipe(screen.getByTestId('swipe-card'), 0, 250);
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('triggers haptic feedback on successful swipe', () => {
    const onSwipeRight = jest.fn();
    render(<SwipeCard onSwipeRight={onSwipeRight}>x</SwipeCard>);
    swipe(screen.getByTestId('swipe-card'), 0, 120);
    expect((navigator.vibrate as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('does not throw when callbacks are undefined', () => {
    render(<SwipeCard>x</SwipeCard>);
    expect(() => swipe(screen.getByTestId('swipe-card'), 0, 120)).not.toThrow();
  });
});
