'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

export type BottomSheetSnapPoint = 0.3 | 0.6 | 0.95;

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  snapPoint?: BottomSheetSnapPoint;
  children?: React.ReactNode;
  ariaLabel?: string;
}

/**
 * Mobile bottom-sheet overlay.
 *
 * - Snap points 30% / 60% (default) / 95% of viewport height.
 * - Drag-handle (top) supports vertical swipe. Swipe-down ≥ 80px → onClose.
 * - Backdrop click → onClose.
 * - Focus trap inside the sheet; Escape closes.
 */
export function BottomSheet({
  open,
  onClose,
  snapPoint = 0.6,
  children,
  ariaLabel = 'Bottom sheet',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [activeSnap, setActiveSnap] = useState<BottomSheetSnapPoint>(snapPoint);
  // Drag state lives in refs (not state) so the values are visible
  // synchronously inside the touchEnd handler — React state batching can
  // otherwise leave touchEnd reading the previous (stale) delta.
  const dragStartYRef = useRef<number | null>(null);
  const dragDeltaRef = useRef<number>(0);

  // The initial snap point is taken from the prop on mount; gesture-driven
  // updates after that are kept in component state. Consumers who want to
  // force a reset can remount the sheet (e.g. via `key`).

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = sheet.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0] ?? sheet;
    first.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    dragStartYRef.current = e.touches[0].clientY;
    dragDeltaRef.current = 0;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    dragDeltaRef.current = e.touches[0].clientY - dragStartYRef.current;
  }, []);

  const onTouchEnd = useCallback(() => {
    const delta = dragDeltaRef.current;
    if (delta > 80) {
      onClose();
    } else if (delta < -80) {
      // Swipe up — promote snap point
      setActiveSnap((prev) => (prev === 0.3 ? 0.6 : prev === 0.6 ? 0.95 : 0.95));
    } else if (delta > 30) {
      // Mild swipe down — demote
      setActiveSnap((prev) => (prev === 0.95 ? 0.6 : prev === 0.6 ? 0.3 : 0.3));
    }
    dragStartYRef.current = null;
    dragDeltaRef.current = 0;
  }, [onClose]);

  if (!open) return null;

  const heightPct = `${Math.round(activeSnap * 100)}vh`;

  return (
    <div
      data-testid="bottom-sheet-root"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
      }}
    >
      <div
        data-testid="bottom-sheet-backdrop"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid="bottom-sheet"
        data-snap-point={activeSnap}
        tabIndex={-1}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: heightPct,
          background: 'white',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
        }}
      >
        <div
          data-testid="bottom-sheet-handle"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            padding: '8px 0',
            display: 'flex',
            justifyContent: 'center',
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              background: '#d1d5db',
              borderRadius: 2,
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

export default BottomSheet;
