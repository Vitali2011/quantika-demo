'use client';
import Link from 'next/link';
import { Home, Sparkles, Box, MoreHorizontal } from 'lucide-react';
import { useMode } from './useMode';
import { cn } from '@/design-system/primitives/_utils';

export function BottomNav() {
  const { isCharterer } = useMode();
  const items = [
    { href: '/dashboard', label: 'Dashboard', Icon: Home },
    { href: '/matches', label: 'Matches', Icon: Sparkles },
    {
      href: isCharterer ? '/cargo' : '/vessels',
      label: isCharterer ? 'Cargo' : 'Vessels',
      Icon: Box,
    },
    { href: '/more', label: 'More', Icon: MoreHorizontal },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-ds-surface border-t border-ds-border flex items-stretch h-14 pb-[env(safe-area-inset-bottom,0px)]"
      aria-label="Mobile navigation"
    >
      {items.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex-1 flex flex-col items-center justify-center gap-0.5 text-ds-text-muted hover:text-ds-text min-h-[44px]',
          )}
          aria-label={label}
        >
          <Icon size={20} aria-hidden="true" />
          <span className="text-[10px] font-medium">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
