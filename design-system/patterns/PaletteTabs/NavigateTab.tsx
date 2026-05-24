'use client';
import Link from 'next/link';

const ROUTES = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/matches', label: 'Matches' },
  { href: '/cargo', label: 'Cargo' },
  { href: '/vessels', label: 'Vessels' },
  { href: '/market', label: 'Market' },
  { href: '/charterers', label: 'Charterers' },
  { href: '/recap', label: 'Recap' },
  { href: '/email', label: 'Email' },
  { href: '/settings', label: 'Settings' },
  { href: '/upgrade', label: 'Upgrade' },
];

export function NavigateTab({ query, onSelect }: { query: string; onSelect: () => void }) {
  const filtered = query
    ? ROUTES.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : ROUTES;
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
