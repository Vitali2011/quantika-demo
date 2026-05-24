'use client';
import { useMode } from './useMode';
import { cn } from '@/design-system/primitives/_utils';

export function ModeSwitcher({ className }: { className?: string }) {
  const { mode, setMode } = useMode();
  return (
    <div
      className={cn('inline-flex bg-ds-surface-muted rounded-ds-md p-0.5 text-xs', className)}
      role="group"
      aria-label="Application mode"
    >
      {(['charterer', 'owner'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={cn(
            'px-3 py-1 rounded-ds-sm transition-colors duration-ds-fast capitalize',
            mode === m
              ? 'bg-ds-accent text-ds-accent-fg font-semibold'
              : 'text-ds-text-muted hover:text-ds-text',
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
