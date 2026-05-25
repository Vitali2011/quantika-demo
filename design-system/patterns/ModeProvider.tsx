'use client';
import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';

export type Mode = 'charterer' | 'owner';

export interface ModeContextValue {
  mode: Mode;
  setMode: (m: Mode) => void;
}

export const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ initial, children }: { initial: Mode; children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === 'undefined') return initial;
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get('mode');
    if (urlMode === 'charterer' || urlMode === 'owner') return urlMode;
    return initial;
  });

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
