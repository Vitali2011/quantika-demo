'use client';
import { usePathname } from 'next/navigation';
import { usePalette } from './usePalette';

const HIDDEN_ON = new Set(['/login', '/']);

export function HelpFAB() {
  const { open } = usePalette();
  const path = usePathname();
  if (HIDDEN_ON.has(path)) return null;
  return (
    <button
      type="button"
      onClick={() => open('help')}
      aria-label="Help"
      className="fixed bottom-20 md:bottom-6 right-6 z-40 bg-ds-accent text-ds-accent-fg rounded-ds-full h-12 w-12 flex items-center justify-center shadow-lg hover:scale-105 transition-transform duration-ds-fast"
    >
      ?
    </button>
  );
}
