'use client';

import React, { useCallback, useRef, useState } from 'react';
import { haptic } from '@/lib/mobile/haptics';

export interface SwipeCardProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Touch-driven swipe-card. Horizontal swipe past `threshold` (default 80px)
 * triggers the corresponding callback and a haptic 'tap'.
 *
 * Drag tracking uses refs (not state) so touchEnd reads the latest delta
 * even when React batches the synthetic events.
 */
export function SwipeCard({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
  children,
  className,
}: SwipeCardProps) {
  // Refs feed the gesture handlers (so touchEnd reads the latest delta even
  // when React batches the synthetic events). State drives the render so the
  // visual transform stays in sync without violating the rules of hooks.
  const startXRef = useRef<number | null>(null);
  const deltaXRef = useRef(0);
  const [renderDelta, setRenderDelta] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    startXRef.current = e.touches[0].clientX;
    deltaXRef.current = 0;
    setRenderDelta(0);
    setDragging(true);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const next = e.touches[0].clientX - startXRef.current;
    deltaXRef.current = next;
    setRenderDelta(next);
  }, []);

  const onTouchEnd = useCallback(() => {
    const delta = deltaXRef.current;
    if (delta <= -threshold) {
      haptic('tap');
      onSwipeLeft?.();
    } else if (delta >= threshold) {
      haptic('tap');
      onSwipeRight?.();
    }
    startXRef.current = null;
    deltaXRef.current = 0;
    setRenderDelta(0);
    setDragging(false);
  }, [threshold, onSwipeLeft, onSwipeRight]);

  return (
    <div
      data-testid="swipe-card"
      data-delta-x={renderDelta}
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: `translateX(${renderDelta}px)`,
        transition: dragging ? undefined : 'transform 0.2s ease',
        touchAction: 'pan-y',
      }}
    >
      {children}
    </div>
  );
}

export default SwipeCard;
