'use client';
import Link from 'next/link';

const ALL_ROUTES = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/matches', label: 'Matches' },
  { href: '/cargo', label: 'Cargo' },
  { href: '/vessels', label: 'Vessels' },
  { href: '/market', label: 'Market' },
  { href: '/charterers', label: 'Charterers' },
  { href: '/recap', label: 'Recap' },
  { href: '/laytime', label: 'Laytime' },
  { href: '/psc', label: 'PSC' },
  { href: '/commission', label: 'Commission' },
  { href: '/clauses', label: 'Clauses' },
  { href: '/email', label: 'Email' },
  { href: '/settings', label: 'Settings' },
  { href: '/upgrade', label: 'Upgrade' },
];

export function NavigateTab({ query, onSelect }: { query: string; onSelect: () => void }) {
  const routes = ALL_ROUTES.filter(
    (r) => r.href !== '/laytime' || process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED === 'true',
  );
  const filtered = query
    ? routes.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : routes;
  if (filtered.length === 0) {
    return <div className="p-4 text-ds-text-subtle text-sm">No matching pages</div>;
  }
  return (
    <ul className="p-1">
      {filtered.map((r) => (
        <li key={r.href}>
          <Link
            href={r.href}
            onClick={onSelect}
            className="block px-3 py-2 rounded-ds-sm text-sm text-ds-text hover:bg-ds-surface-muted"
          >
            {r.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
