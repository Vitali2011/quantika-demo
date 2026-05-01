/**
 * Haptic feedback wrapper around the Vibration API.
 * Noop on platforms without `navigator.vibrate` (desktop, iOS Safari, etc.).
 */

export type HapticPattern = 'tap' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  success: [10, 50, 10],
  warning: [30, 50, 30],
  error: [50, 100, 50],
};

export function haptic(pattern: HapticPattern): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== 'function') return;
  try {
    nav.vibrate(PATTERNS[pattern]);
  } catch {
    // swallow — haptics are best-effort
  }
}

export const __HAPTIC_PATTERNS__ = PATTERNS;
