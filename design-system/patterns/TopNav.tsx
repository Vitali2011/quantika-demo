'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMode } from './useMode';
import { ModeSwitcher } from './ModeSwitcher';
import { cn } from '@/design-system/primitives/_utils';

const MORE_ITEMS = [
  { href: '/charterers', label: 'Charterers' },
  { href: '/recap', label: 'Recap' },
  { href: '/laytime', label: 'Laytime' },
  { href: '/psc', label: 'PSC' },
  { href: '/commission', label: 'Commission' },
  { href: '/clauses', label: 'Clauses' },
  { href: '/email', label: 'Email' },
  { href: '/settings', label: 'Settings' },
];

export function TopNav() {
  const { isCharterer } = useMode();
  const third = isCharterer ? { href: '/cargo', label: 'Cargo' } : { href: '/vessels', label: 'Vessels' };
  const fourth = isCharterer ? { href: '/vessels', label: 'Vessels' } : { href: '/cargo', label: 'Cargo' };

  return (
    <header className="hidden md:flex items-center gap-6 bg-ds-surface border-b border-ds-border px-6 py-3 sticky top-0 z-30">
      <Link href="/dashboard" className="text-ds-accent font-bold text-lg shrink-0" aria-label="Quantika home">
        Q
      </Link>
      <nav className="flex items-center gap-6 text-sm" aria-label="Primary navigation">
        <NavLink href="/dashboard">Dashboard</NavLink>
        <NavLink href="/matches">Matches</NavLink>
        <NavLink href={third.href} isModePrimary>{third.label}</NavLink>
        <NavLink href={fourth.href}>{fourth.label}</NavLink>
        <NavLink href="/market">Market</NavLink>
        <MoreDropdown />
      </nav>
      <div className="ml-auto shrink-0">
        <ModeSwitcher />
      </div>
    </header>
  );
}

function NavLink({ href, children, isModePrimary }: { href: string; children: React.ReactNode; isModePrimary?: boolean }) {
  const pathname = usePathname();
  const isActive = pathname != null && (pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/')));

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'font-medium transition-colors duration-ds-fast',
        isActive
          ? 'text-ds-text'
          : isModePrimary
            ? 'text-ds-accent/80 hover:text-ds-accent'
            : 'text-ds-text-muted hover:text-ds-text',
      )}
    >
      {children}
    </Link>
  );
}

function MoreDropdown() {
  return (
    <details className="relative">
      <summary
        className="text-ds-text-muted hover:text-ds-text font-medium cursor-pointer list-none"
        role="button"
        aria-label="More"
      >
        ⋯ More
      </summary>
      <ul className="absolute right-0 mt-2 min-w-[180px] bg-ds-surface border border-ds-border rounded-ds-md shadow-lg py-1 z-40">
        {MORE_ITEMS.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              className="block px-3 py-1.5 text-sm text-ds-text hover:bg-ds-surface-muted"
            >
              {it.label}
            </Link>
          </li>
        ))}
        <li className="border-t border-ds-border mt-1 pt-1">
          <form method="POST" action="/api/auth/logout">
            <button
              type="submit"
              className="block w-full text-left px-3 py-1.5 text-sm text-ds-text hover:bg-ds-surface-muted"
            >
              Log out
            </button>
          </form>
        </li>
      </ul>
    </details>
  );
}
