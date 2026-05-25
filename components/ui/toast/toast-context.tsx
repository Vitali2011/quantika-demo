'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'default';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastMethods {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  action: (msg: string, opts: { label: string; onClick: () => void }) => void;
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: ToastMethods;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 10);
    setToasts(prev => [...prev, { ...item, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, DURATION_MS);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useMemo<ToastMethods>(() => ({
    success: (msg) => add({ variant: 'success', message: msg }),
    error: (msg) => add({ variant: 'error', message: msg }),
    info: (msg) => add({ variant: 'info', message: msg }),
    action: (msg, opts) => add({ variant: 'default', message: msg, action: opts }),
  }), [add]);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastMethods {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}

export function useToastItems(): { toasts: ToastItem[]; dismiss: (id: string) => void } {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastItems must be used within ToastProvider');
  return { toasts: ctx.toasts, dismiss: ctx.dismiss };
}
