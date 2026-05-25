'use client';
import { useToastItems, type ToastVariant } from './toast-context';

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'bg-ds-success-soft text-ds-success border-ds-success/20',
  error:   'bg-ds-danger-soft text-ds-danger border-ds-danger/20',
  info:    'bg-ds-info-soft text-ds-info border-ds-info/20',
  default: 'bg-ds-surface text-ds-text border-ds-border',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToastItems();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role="status"
          data-variant={t.variant}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-3 text-sm rounded-ds-md border shadow-lg max-w-sm ${VARIANT_CLASSES[t.variant]}`}
        >
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              onClick={t.action.onClick}
              className="text-xs font-semibold underline hover:no-underline flex-shrink-0"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            aria-label="dismiss"
            className="ml-1 opacity-60 hover:opacity-100 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
