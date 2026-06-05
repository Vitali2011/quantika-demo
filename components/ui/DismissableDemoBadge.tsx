'use client';

import { useState } from 'react';

interface DismissableDemoBadgeProps {
  storageKey: string;
  'data-testid'?: string;
}

export function DismissableDemoBadge({
  storageKey,
  'data-testid': testId = 'demo-data-badge',
}: DismissableDemoBadgeProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'dismissed';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(storageKey, 'dismissed');
    } catch {
      // ignore write failures
    }
    setDismissed(true);
  }

  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
    >
      Demo data
      <button
        type="button"
        data-testid="dismiss-demo-badge"
        aria-label="Dismiss demo data badge"
        onClick={handleDismiss}
        className="ml-0.5 rounded-full p-0.5 hover:bg-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
      >
        ×
      </button>
    </span>
  );
}
