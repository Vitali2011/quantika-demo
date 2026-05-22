'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home as HomeIcon, Layers, TrendingUp, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

function isHomeActive(pathname: string): boolean {
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/cargo/') ||
    pathname.startsWith('/email/') ||
    pathname.startsWith('/fixture/')
  );
}

function isMatchesActive(pathname: string): boolean {
  return pathname === '/matches' || pathname.startsWith('/match/');
}

function isMarketActive(pathname: string): boolean {
  return pathname === '/market';
}

export default function BottomNav() {
  const pathname = usePathname();

  const homeActive = isHomeActive(pathname);
  const matchesActive = isMatchesActive(pathname);
  const marketActive = isMarketActive(pathname);

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 min-h-14 pb-[env(safe-area-inset-bottom,0px)] bg-background border-t border-border z-30 flex items-center justify-around"
    >
      <Link
        href="/dashboard"
        aria-current={homeActive ? 'page' : undefined}
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs',
          homeActive ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <HomeIcon className="size-5" aria-hidden="true" />
        <span>Home</span>
      </Link>
      <Link
        href="/matches"
        aria-current={matchesActive ? 'page' : undefined}
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs',
          matchesActive ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Layers className="size-5" aria-hidden="true" />
        <span>Matches</span>
      </Link>
      <Link
        href="/market"
        aria-current={marketActive ? 'page' : undefined}
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs',
          marketActive ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <TrendingUp className="size-5" aria-hidden="true" />
        <span>Market</span>
      </Link>
      <Link
        href="/more"
        aria-current={undefined}
        className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs text-muted-foreground"
      >
        <Menu className="size-5" aria-hidden="true" />
        <span>More</span>
      </Link>
    </nav>
  );
}
