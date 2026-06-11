'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function LogicDisclosure({ label, testId, children }: { label: ReactNode; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-ds-text-muted hover:text-ds-text transition-colors"
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
      </button>
      {open && (
        <div className="mt-1.5 pl-3 border-l-2 border-ds-border" data-testid={`${testId}-body`}>
          {children}
        </div>
      )}
    </div>
  );
}
