'use client';

/**
 * Client-side companion to lib/clock.ts. Exposes the frozen snapshot time to
 * client components so relative-date displays ("X ago", countdowns) don't drift
 * against the real browser clock in DEMO_MODE.
 *
 * The server (app/layout.tsx) reads getDemoFrozenDate() in DEMO_MODE and feeds
 * the frozen ms into DemoClockProvider; in live mode it passes null.
 *
 * See docs/superpowers/specs/2026-05-27-quantika-demo-frozen-snapshot-design.md
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Frozen "now" in epoch ms for DEMO_MODE; null in live (real-clock) mode.
const DemoClockContext = createContext<number | null>(null);

export function DemoClockProvider({
  frozenMs,
  children,
}: {
  frozenMs: number | null;
  children: ReactNode;
}) {
  return <DemoClockContext.Provider value={frozenMs}>{children}</DemoClockContext.Provider>;
}

/**
 * Single source of "now" (epoch ms) for client relative-date displays.
 *
 * - DEMO_MODE (provider supplied a frozen ms): returns that constant. It is known
 *   at SSR time, so server and client render identically — no hydration mismatch,
 *   no placeholder flash, and the value never decays.
 * - Live mode (provider value is null): returns null until post-mount (preserving
 *   the existing SSR-deferral that avoids hydration mismatch), then the real
 *   Date.now(), re-ticking every `tickMs` if provided (e.g. 1000 for a countdown).
 */
export function useNow(tickMs?: number): number | null {
  const frozenMs = useContext(DemoClockContext);
  const [liveNow, setLiveNow] = useState<number | null>(null);

  useEffect(() => {
    if (frozenMs !== null) return; // frozen — constant, never ticks
    // Intentional post-mount setState: flips the null SSR sentinel to the real
    // clock only after hydration — the canonical React fix for #418 time-mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveNow(Date.now());
    if (tickMs && tickMs > 0) {
      const id = setInterval(() => setLiveNow(Date.now()), tickMs);
      return () => clearInterval(id);
    }
  }, [frozenMs, tickMs]);

  return frozenMs !== null ? frozenMs : liveNow;
}
