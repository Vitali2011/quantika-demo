'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers, Box, Sparkles, MoreHorizontal } from 'lucide-react';
import { useMode } from './useMode';
import { cn } from '@/design-system/primitives/_utils';

export function BottomNav() {
  const { isCharterer } = useMode();
  const pathname = usePathname();
  const items = [
    { href: '/matches', label: 'Matches', Icon: Layers },
    {
      href: isCharterer ? '/cargo' : '/vessels',
      label: isCharterer ? 'Cargo' : 'Vessels',
      Icon: Box,
    },
  ];

  const handleAIClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-command-palette'));
    }
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-ds-surface border-t border-ds-border flex items-stretch h-14 pb-[env(safe-area-inset-bottom,0px)]"
      aria-label="Mobile navigation"
    >
      {items.map(({ href, label, Icon }) => {
        const isActive = pathname != null && (pathname === href || (href !== '/more' && pathname.startsWith(href + '/')));
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors',
              isActive ? 'text-ds-accent' : 'text-ds-text-muted hover:text-ds-text',
            )}
            aria-label={label}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={handleAIClick}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-ds-text-muted hover:text-ds-text transition-colors"
        aria-label="AI command palette"
      >
        <Sparkles size={20} aria-hidden="true" />
        <span className="text-[10px] font-medium">AI</span>
      </button>
      <Link
        href="/more"
        aria-current={pathname === '/more' ? 'page' : undefined}
        className={cn(
          'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors',
          pathname === '/more' ? 'text-ds-accent' : 'text-ds-text-muted hover:text-ds-text',
        )}
        aria-label="More"
      >
        <MoreHorizontal size={20} aria-hidden="true" />
        <span className="text-[10px] font-medium">More</span>
      </Link>
    </nav>
  );
}
