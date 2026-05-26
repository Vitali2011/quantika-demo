'use client';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Mode = 'charterer' | 'owner';

export interface ModeContextValue {
  mode: Mode;
  setMode: (m: Mode) => void;
}

export const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ initial, children }: { initial: Mode; children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(initial);

  // Hydration-safe: read URL ?mode= param after mount only.
  // Reading window.location.search inside useState initializer causes React
  // error #419 (server returns `initial`, client may return a different value).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get('mode');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (urlMode === 'charterer' || urlMode === 'owner') setModeState(urlMode);
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    // persist to cookie for SSR fast-path
    if (typeof document !== 'undefined') {
      document.cookie = `preferred_mode=${m}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    }
    // optimistic; fire-and-forget PATCH
    fetch('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preferred_mode: m }),
    }).catch(() => {});
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', m);
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}
