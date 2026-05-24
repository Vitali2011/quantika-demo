# R3 — AIBar + ⌘K Palette · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** Заменить R2 AIBarPlaceholder на работающий AIBar + ⌘K palette с tabs (Actions/Navigate/Help/Recents) + Floating HelpFAB.

**Spec:** [/docs/superpowers/specs/2026-05-24-r3-aibar-cmdk-design.md](../specs/2026-05-24-r3-aibar-cmdk-design.md)
**Branch:** `design/r3-aibar-cmdk` (create from main after R2 merged)
**Depends:** R2 (AppShell, useMode, Dialog primitive)
**Tier:** M · ~15 файлов · ~3-4 дня

---

## Pre-flight

- [ ] **0.1** Worktree:
```bash
cd ~/work/quantika-demo
git fetch origin
git checkout main && git pull
git checkout -b design/r3-aibar-cmdk
git worktree add .worktrees/r3-aibar design/r3-aibar-cmdk
cd .worktrees/r3-aibar
```

- [ ] **0.2** Verify R2 merged: `grep -l 'AppShell' design-system/patterns/index.ts` → должен экспортить.

---

## Task 1: usePalette hook

**Files:**
- Create: `design-system/patterns/usePalette.ts`
- Test: `design-system/__tests__/usePalette.test.tsx`

- [ ] **1.1 Failing test:**

```tsx
import { render, screen, act } from '@testing-library/react';
import { usePalette, PaletteProvider } from '../patterns/usePalette';

function Probe() {
  const { open, isOpen, close } = usePalette();
  return (
    <>
      <span data-testid="state">{isOpen ? 'open' : 'closed'}</span>
      <button onClick={open}>open</button>
      <button onClick={close}>close</button>
    </>
  );
}

describe('usePalette', () => {
  it('opens and closes', () => {
    render(<PaletteProvider><Probe /></PaletteProvider>);
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
    act(() => { screen.getByText('open').click(); });
    expect(screen.getByTestId('state')).toHaveTextContent('open');
    act(() => { screen.getByText('close').click(); });
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
  });

  it('⌘K opens palette globally', () => {
    render(<PaletteProvider><Probe /></PaletteProvider>);
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
      window.dispatchEvent(event);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('open');
  });
});
```

- [ ] **1.2 Implement:**

```tsx
// design-system/patterns/usePalette.ts
'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type PaletteTab = 'actions' | 'navigate' | 'help' | 'recents';

interface Ctx {
  isOpen: boolean;
  activeTab: PaletteTab;
  open: (tab?: PaletteTab) => void;
  close: () => void;
  setTab: (t: PaletteTab) => void;
}

const PaletteCtx = createContext<Ctx | null>(null);

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PaletteTab>('actions');

  const open = useCallback((tab?: PaletteTab) => {
    if (tab) setActiveTab(tab);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <PaletteCtx.Provider value={{ isOpen, activeTab, open, close, setTab: setActiveTab }}>
      {children}
    </PaletteCtx.Provider>
  );
}

export function usePalette() {
  const ctx = useContext(PaletteCtx);
  if (!ctx) throw new Error('usePalette must be inside <PaletteProvider>');
  return ctx;
}
```

- [ ] **1.3 Run PASS. Commit `feat(r3): usePalette hook + ⌘K global listener`.**

---

## Task 2: ActionsTab content

**Files:**
- Create: `design-system/patterns/PaletteTabs/ActionsTab.tsx`
- Test: `design-system/__tests__/ActionsTab.test.tsx`

- [ ] **2.1 Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeProvider } from '../patterns/ModeProvider';
import { ActionsTab } from '../patterns/PaletteTabs/ActionsTab';

describe('ActionsTab', () => {
  it('lists charterer-mode actions', () => {
    render(<ModeProvider initial="charterer"><ActionsTab query="" onSelect={() => {}} /></ModeProvider>);
    expect(screen.getByText(/find vessel/i)).toBeInTheDocument();
  });

  it('filters by query', async () => {
    render(<ModeProvider initial="charterer"><ActionsTab query="recap" onSelect={() => {}} /></ModeProvider>);
    expect(screen.getByText(/generate recap/i)).toBeInTheDocument();
    expect(screen.queryByText(/find vessel/i)).toBeNull();
  });
});
```

- [ ] **2.2 Implement:**

```tsx
// design-system/patterns/PaletteTabs/ActionsTab.tsx
'use client';
import { useMode } from '../useMode';
import { cn } from '@/design-system/primitives/_utils';

interface Action { id: string; label: string; description?: string; handler: () => void; }

function getActions(mode: 'charterer' | 'owner'): Action[] {
  const common: Action[] = [
    { id: 'recap', label: 'Generate recap from last fixture', handler: () => location.href = '/recap' },
    { id: 'market', label: 'Show market — HSS Med rate', handler: () => location.href = '/market' },
  ];
  return mode === 'charterer'
    ? [{ id: 'find-v', label: 'Find vessel for cargo', handler: () => location.href = '/matches' }, ...common]
    : [{ id: 'find-c', label: 'Find cargo for vessel', handler: () => location.href = '/matches' }, ...common];
}

export function ActionsTab({ query, onSelect }: { query: string; onSelect: () => void }) {
  const { mode } = useMode();
  const all = getActions(mode);
  const filtered = query ? all.filter((a) => a.label.toLowerCase().includes(query.toLowerCase())) : all;
  if (filtered.length === 0) return <div className="p-4 text-ds-text-subtle text-sm">No matching actions</div>;
  return (
    <ul className="p-1">
      {filtered.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => { a.handler(); onSelect(); }}
            className={cn('w-full text-left px-3 py-2 rounded-ds-sm text-sm text-ds-text', 'hover:bg-ds-surface-muted')}
          >
            {a.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **2.3 Run PASS. Commit `feat(r3): ActionsTab with mode-aware filtering`.**

---

## Task 3: NavigateTab

**Files:**
- Create: `design-system/patterns/PaletteTabs/NavigateTab.tsx`
- Test: `design-system/__tests__/NavigateTab.test.tsx`

- [ ] **3.1 Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigateTab } from '../patterns/PaletteTabs/NavigateTab';

it('NavigateTab lists routes and filters', async () => {
  render(<NavigateTab query="" onSelect={() => {}} />);
  expect(screen.getByText('Matches')).toBeInTheDocument();
  expect(screen.getByText('Cargo')).toBeInTheDocument();
});

it('filters by query', () => {
  render(<NavigateTab query="set" onSelect={() => {}} />);
  expect(screen.getByText('Settings')).toBeInTheDocument();
  expect(screen.queryByText('Matches')).toBeNull();
});
```

- [ ] **3.2 Implement:**

```tsx
// design-system/patterns/PaletteTabs/NavigateTab.tsx
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
  const filtered = query ? ROUTES.filter((r) => r.label.toLowerCase().includes(query.toLowerCase())) : ROUTES;
  if (filtered.length === 0) return <div className="p-4 text-ds-text-subtle text-sm">No matching pages</div>;
  return (
    <ul className="p-1">
      {filtered.map((r) => (
        <li key={r.href}>
          <Link href={r.href} onClick={onSelect} className="block px-3 py-2 rounded-ds-sm text-sm text-ds-text hover:bg-ds-surface-muted">
            {r.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **3.3 Run PASS. Commit `feat(r3): NavigateTab with route filter`.**

---

## Task 4: HelpTab + /api/help/ask

**Files:**
- Create: `design-system/patterns/PaletteTabs/HelpTab.tsx`
- Create: `app/api/help/ask/route.ts`
- Test: `__tests__/api/help-ask.test.ts`
- Test: `design-system/__tests__/HelpTab.test.tsx`

- [ ] **4.1 Backend test:**

```ts
import { POST } from '@/app/api/help/ask/route';
import { makeAuthRequest } from '../helpers/auth';

it('POST returns answer + sources', async () => {
  const req = await makeAuthRequest('POST', '/api/help/ask', { query: 'how to connect Gmail' });
  const res = await POST(req);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ answer: expect.any(String), sources: expect.any(Array) });
});

it('rejects empty query', async () => {
  const req = await makeAuthRequest('POST', '/api/help/ask', { query: '' });
  const res = await POST(req);
  expect(res.status).toBe(400);
});
```

- [ ] **4.2 Implement endpoint:**

```ts
// app/api/help/ask/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== 'string' || query.trim().length < 3) {
    return NextResponse.json({ error: 'query must be ≥3 chars' }, { status: 400 });
  }

  // TODO: integrate with Knowledge Phase 2 RAG (/api/knowledge/ask if exists)
  // Stub: forward to RAG or return canned response
  try {
    const rag = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/knowledge/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ query }),
    });
    if (rag.ok) {
      const data = await rag.json();
      return NextResponse.json({ answer: data.answer ?? data.text ?? '', sources: data.sources ?? [] });
    }
  } catch { /* fall through */ }

  // Fallback canned answer
  return NextResponse.json({
    answer: 'Quantika умеет парсить email, считать TCE, генерить recap. Конкретный гайд скоро появится в docs.',
    sources: [{ title: 'Quick start', url: '/docs/quickstart' }],
  });
}
```

- [ ] **4.3 Implement HelpTab:**

```tsx
// design-system/patterns/PaletteTabs/HelpTab.tsx
'use client';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/design-system/primitives';

interface Answer { answer: string; sources: { title: string; url: string }[] }

export function HelpTab({ query }: { query: string }) {
  const [data, setData] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 3) { setData(null); return; }
    setLoading(true);
    const ctrl = new AbortController();
    fetch('/api/help/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [query]);

  if (query.length < 3) return <div className="p-4 text-ds-text-subtle text-sm">Type your question (≥3 chars)…</div>;
  if (loading) return <div className="p-4 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div>;
  if (!data) return null;
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-ds-text leading-relaxed">{data.answer}</p>
      {data.sources.length > 0 && (
        <div className="text-xs text-ds-text-muted">
          <span className="font-semibold">Sources:</span>{' '}
          {data.sources.map((s, i) => (
            <a key={i} href={s.url} className="text-ds-accent underline mr-2">{s.title}</a>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **4.4 Run PASS. Commit `feat(r3): HelpTab + /api/help/ask (RAG-backed with fallback)`.**

---

## Task 5: RecentsTab

**Files:**
- Create: `design-system/patterns/PaletteTabs/RecentsTab.tsx`

- [ ] **5.1 Implement (simple, no test required for stub):**

```tsx
// design-system/patterns/PaletteTabs/RecentsTab.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Recent { href: string; label: string; ts: number }

export function RecentsTab({ onSelect }: { onSelect: () => void }) {
  const [items, setItems] = useState<Recent[]>([]);
  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem('quantika.recents') || '[]')); } catch {}
  }, []);
  if (items.length === 0) return <div className="p-4 text-ds-text-subtle text-sm">No recent actions yet</div>;
  return (
    <ul className="p-1">
      {items.slice(0, 5).map((r) => (
        <li key={r.href}>
          <Link href={r.href} onClick={onSelect} className="block px-3 py-2 rounded-ds-sm text-sm text-ds-text hover:bg-ds-surface-muted">
            {r.label} <span className="text-ds-text-subtle text-xs">· {new Date(r.ts).toLocaleString('en-US')}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **5.2 Commit `feat(r3): RecentsTab from localStorage`.**

---

## Task 6: CmdKPalette container

**Files:**
- Create: `design-system/patterns/CmdKPalette.tsx`
- Test: `design-system/__tests__/CmdKPalette.test.tsx`

- [ ] **6.1 Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeProvider } from '../patterns/ModeProvider';
import { PaletteProvider, usePalette } from '../patterns/usePalette';
import { CmdKPalette } from '../patterns/CmdKPalette';

function Trigger() { const { open } = usePalette(); return <button onClick={() => open()}>x</button>; }

describe('CmdKPalette', () => {
  it('opens with tabs and input', async () => {
    render(<ModeProvider initial="charterer"><PaletteProvider><Trigger /><CmdKPalette /></PaletteProvider></ModeProvider>);
    await userEvent.click(screen.getByText('x'));
    expect(screen.getByPlaceholderText(/search|ask/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /actions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /navigate/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /help/i })).toBeInTheDocument();
  });
});
```

- [ ] **6.2 Implement:**

```tsx
// design-system/patterns/CmdKPalette.tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import { Dialog, Input, Tabs } from '@/design-system/primitives';
import { usePalette } from './usePalette';
import { ActionsTab } from './PaletteTabs/ActionsTab';
import { NavigateTab } from './PaletteTabs/NavigateTab';
import { HelpTab } from './PaletteTabs/HelpTab';
import { RecentsTab } from './PaletteTabs/RecentsTab';

export function CmdKPalette() {
  const { isOpen, close, activeTab, setTab } = usePalette();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Content className="!max-w-xl !top-[20vh] !translate-y-0">
        <Dialog.Title className="!mb-2">Quick actions</Dialog.Title>
        <Input ref={inputRef} placeholder="Search or ask…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mt-3">
          <Tabs.Root value={activeTab} onValueChange={(v: any) => setTab(v)}>
            <Tabs.List>
              <Tabs.Trigger value="actions">Actions</Tabs.Trigger>
              <Tabs.Trigger value="navigate">Navigate</Tabs.Trigger>
              <Tabs.Trigger value="help">Help</Tabs.Trigger>
              <Tabs.Trigger value="recents">Recents</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Panel value="actions"><ActionsTab query={query} onSelect={close} /></Tabs.Panel>
            <Tabs.Panel value="navigate"><NavigateTab query={query} onSelect={close} /></Tabs.Panel>
            <Tabs.Panel value="help"><HelpTab query={query} /></Tabs.Panel>
            <Tabs.Panel value="recents"><RecentsTab onSelect={close} /></Tabs.Panel>
          </Tabs.Root>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
```

- [ ] **6.3 Run PASS. Commit `feat(r3): CmdKPalette container with 4 tabs`.**

---

## Task 7: AIBar (replaces placeholder)

**Files:**
- Create: `design-system/patterns/AIBar.tsx`
- Modify: `design-system/patterns/AppShell.tsx`
- Modify: `design-system/patterns/index.ts`

- [ ] **7.1 Implement:**

```tsx
// design-system/patterns/AIBar.tsx
'use client';
import { useMode } from './useMode';
import { usePalette } from './usePalette';

export function AIBar() {
  const { t } = useMode();
  const { open } = usePalette();
  return (
    <button
      type="button"
      onClick={() => open('help')}
      className="hidden md:flex items-center gap-2 w-full bg-ds-surface border-b border-ds-border px-6 py-2 text-sm text-ds-text-subtle hover:bg-ds-surface-muted text-left"
      aria-label="Open AI assistant"
    >
      <span className="flex-1">💬 {t('aibar.placeholder')}</span>
      <kbd className="bg-ds-surface-muted text-ds-text-muted px-1.5 py-0.5 rounded text-[10px] font-semibold">⌘K</kbd>
    </button>
  );
}
```

- [ ] **7.2 Update AppShell:**

```tsx
// design-system/patterns/AppShell.tsx (replace AIBarPlaceholder import + usage)
import { AIBar } from './AIBar';
import { CmdKPalette } from './CmdKPalette';
import { PaletteProvider } from './usePalette';
import { HelpFAB } from './HelpFAB';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PaletteProvider>
      <div className="min-h-screen bg-ds-bg text-ds-text flex flex-col">
        <TopNav />
        <AIBar />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <BottomNav />
        <HelpFAB />
        <CmdKPalette />
      </div>
    </PaletteProvider>
  );
}
```

- [ ] **7.3 Update barrel + commit `feat(r3): AIBar replacing placeholder, wired into AppShell`.**

---

## Task 8: HelpFAB

**Files:**
- Create: `design-system/patterns/HelpFAB.tsx`

- [ ] **8.1 Implement:**

```tsx
// design-system/patterns/HelpFAB.tsx
'use client';
import { usePalette } from './usePalette';
import { usePathname } from 'next/navigation';

const HIDDEN_ON = ['/login', '/'];

export function HelpFAB() {
  const { open } = usePalette();
  const path = usePathname();
  if (HIDDEN_ON.includes(path)) return null;
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
```

- [ ] **8.2 Commit `feat(r3): HelpFAB floating button`.**

---

## Task 9: Visual regression + a11y

**Files:**
- Create: `tests/visual/cmdk-palette.spec.ts`

- [ ] **9.1 Spec:**

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('⌘K opens palette', async ({ page }) => {
  await page.goto('/matches');
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveScreenshot('palette-open.png', { maxDiffPixelRatio: 0.02 });
});

test('HelpFAB visible on /matches', async ({ page }) => {
  await page.goto('/matches');
  await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
});

test('AIBar clickable', async ({ page }) => {
  await page.goto('/matches');
  await page.getByRole('button', { name: /open ai assistant/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a11y — 0 violations with palette open', async ({ page }) => {
  await page.goto('/matches');
  await page.keyboard.press('Meta+k');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
```

- [ ] **9.2 Generate baseline + commit `test(r3): visual + a11y for CmdKPalette + HelpFAB`.**

---

## Task 10: Final + PR

- [ ] **10.1** TS strict 0 errors, jest green, Playwright + axe green
- [ ] **10.2** Push + PR `R3: AIBar + ⌘K Palette + HelpFAB`
- [ ] **10.3** NO auto-merge — /test-skill QA gate отдельно

## Success criteria

- ⌘K из любой page opens palette
- AIBar click opens palette (Help tab)
- HelpFAB visible на authenticated routes
- HelpTab fires /api/help/ask на ≥3 chars query
- TS strict + tests green

## Out of scope

- SSE streaming RAG (R6)
- Voice input (R6)
- Persistent chat history (future)
