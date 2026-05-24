'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type PaletteTab = 'actions' | 'navigate' | 'help' | 'recents';

interface Ctx {
  isOpen: boolean;
  activeTab: PaletteTab;
  open: (tab?: PaletteTab) => void;
  close: () => void;
  setTab: (t: PaletteTab) => void;
}

const PaletteCtx = createContext<Ctx | null>(null);

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PaletteTab>('actions');

  const open = useCallback((tab?: PaletteTab) => {
    if (tab) setActiveTab(tab);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <PaletteCtx.Provider value={{ isOpen, activeTab, open, close, setTab: setActiveTab }}>
      {children}
    </PaletteCtx.Provider>
  );
}

export function usePalette() {
  const ctx = useContext(PaletteCtx);
  if (!ctx) throw new Error('usePalette must be inside <PaletteProvider>');
  return ctx;
}
