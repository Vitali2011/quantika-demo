'use client';

import { useCallback } from 'react';

export function ScrollLink({ targetId, className, children }: { targetId: string; className: string; children: React.ReactNode }) {
  const handleClick = useCallback(() => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [targetId]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
    >
      {children}
    </button>
  );
}
