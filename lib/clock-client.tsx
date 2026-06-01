'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * Receives frozenMs from the server layout (via demoNow()).
 * null means non-demo mode — clients fall back to real Date.now().
 */
const ClockContext = createContext<number | null>(null);

export function ClockProvider({
  frozenMs,
  children,
}: {
  frozenMs: number | null;
  children: React.ReactNode;
}) {
  return <ClockContext.Provider value={frozenMs}>{children}</ClockContext.Provider>;
}

/**
 * Hydration-safe demo clock — returns milliseconds since epoch.
 *
 * Demo mode: returns frozen timestamp from context (server and client agree,
 *   so no React #418 hydration mismatch).
 * Non-demo: returns 0 before mount (SSR sentinel — callers must guard `=== 0`),
 *   then real Date.now(), updated every 60s.
 */
export function useDemoNow(): number {
  const frozen = useContext(ClockContext);
  const [realNow, setRealNow] = useState<number>(0);

  useEffect(() => {
    if (frozen !== null) return; // demo mode: context value used directly
    const tick = () => setRealNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [frozen]);

  // Demo mode: server and client both see frozen from context — no mismatch.
  if (frozen !== null) return frozen;
  // Non-demo: 0 on SSR, real clock after mount.
  return realNow;
}
