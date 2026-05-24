'use client';
import { useMode } from './useMode';
import { usePalette } from './usePalette';

export function AIBar() {
  const { t } = useMode();
  const { open } = usePalette();
  return (
    <button
      type="button"
      onClick={() => open('help')}
      className="hidden md:flex items-center gap-2 w-full bg-ds-surface border-b border-ds-border px-6 py-2 text-sm text-ds-text-subtle hover:bg-ds-surface-muted text-left"
      aria-label="Open AI assistant"
    >
      <span className="flex-1">💬 {t('aibar.placeholder')}</span>
      <kbd className="bg-ds-surface-muted text-ds-text-muted px-1.5 py-0.5 rounded text-[10px] font-semibold">
        ⌘K
      </kbd>
    </button>
  );
}
