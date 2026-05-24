'use client';
import { useMode } from '../useMode';
import { cn } from '@/design-system/primitives/_utils';

interface Action { id: string; label: string; handler: () => void; }

function getActions(mode: 'charterer' | 'owner'): Action[] {
  const common: Action[] = [
    { id: 'recap', label: 'Generate recap from last fixture', handler: () => { window.location.href = '/recap'; } },
    { id: 'market', label: 'Show market — HSS Med rate', handler: () => { window.location.href = '/market'; } },
  ];
  return mode === 'charterer'
    ? [{ id: 'find-v', label: 'Find vessel for cargo', handler: () => { window.location.href = '/matches'; } }, ...common]
    : [{ id: 'find-c', label: 'Find cargo for vessel', handler: () => { window.location.href = '/matches'; } }, ...common];
}

export function ActionsTab({ query, onSelect }: { query: string; onSelect: () => void }) {
  const { mode } = useMode();
  const all = getActions(mode);
  const filtered = query
    ? all.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
    : all;
  if (filtered.length === 0) {
    return <div className="p-4 text-ds-text-subtle text-sm">No matching actions</div>;
  }
  return (
    <ul className="p-1">
      {filtered.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => { a.handler(); onSelect(); }}
            className={cn(
              'w-full text-left px-3 py-2 rounded-ds-sm text-sm text-ds-text',
              'hover:bg-ds-surface-muted',
            )}
          >
            {a.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
