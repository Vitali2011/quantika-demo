'use client';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { cn } from '@/design-system/primitives/_utils';

export function DarkToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={theme === 'dark'}
      className={cn(
        'p-1.5 rounded-ds-sm text-ds-text-muted hover:text-ds-text hover:bg-ds-surface-muted transition-colors duration-ds-fast',
        className,
      )}
    >
      {theme === 'dark'
        ? <Sun size={16} aria-hidden="true" />
        : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
