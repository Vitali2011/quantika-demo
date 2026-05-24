'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Recent { href: string; label: string; ts: number }

export function RecentsTab({ onSelect }: { onSelect: () => void }) {
  const [items, setItems] = useState<Recent[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount init from localStorage
    try { setItems(JSON.parse(localStorage.getItem('quantika.recents') || '[]')); } catch { /* ignore */ }
  }, []);
  if (items.length === 0) {
    return <div className="p-4 text-ds-text-subtle text-sm">No recent actions yet</div>;
  }
  return (
    <ul className="p-1">
      {items.slice(0, 5).map((r) => (
        <li key={r.href}>
          <Link
            href={r.href}
            onClick={onSelect}
            className="block px-3 py-2 rounded-ds-sm text-sm text-ds-text hover:bg-ds-surface-muted"
          >
            {r.label}{' '}
            <span className="text-ds-text-subtle text-xs">· {new Date(r.ts).toLocaleString('en-US')}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
