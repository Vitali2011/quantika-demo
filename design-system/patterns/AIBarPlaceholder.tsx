'use client';
import { useMode } from './useMode';

export function AIBarPlaceholder() {
  const { t } = useMode();
  return (
    <div className="hidden md:flex items-center gap-2 bg-ds-surface border-b border-ds-border px-6 py-2 text-sm text-ds-text-subtle">
      <span className="flex-1">💬 {t('aibar.placeholder')}</span>
      <kbd className="bg-ds-surface-muted text-ds-text-muted px-1.5 py-0.5 rounded text-[10px] font-semibold">
        ⌘K
      </kbd>
    </div>
  );
}
