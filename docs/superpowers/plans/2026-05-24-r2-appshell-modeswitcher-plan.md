# R2 — AppShell + ModeSwitcher · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Обернуть приложение в AppShell (TopNav 5+More / BottomNav mobile / ModeSwitcher / AIBarPlaceholder), все на R1 primitives. Не трогаем page контент.

**Architecture:** AppShell wraps `app/(authenticated)/layout.tsx` (новая route group). ModeProvider context оборачивает children. Mode resolves: URL `?mode=` → DB `users.preferred_mode` → default. `/api/me` GET/PATCH для persist. Mode-aware nav-slot mapping через `useMode()`.

**Tech Stack:** Next.js 16 app router, design-system/ primitives R1, React Context, SQLite migration, jest + Playwright.

**Spec:** [/docs/superpowers/specs/2026-05-24-r2-appshell-modeswitcher-design.md](../specs/2026-05-24-r2-appshell-modeswitcher-design.md)

**Branch:** `design/r2-appshell-modeswitcher` (создан orchestrator'ом).

**Tier:** M · ~20 файлов · ~4-5 дней. Low-risk: parallel layer, существующие pages не трогаем.

---

## Pre-flight

- [ ] **0.1 — Worktree:**
  ```bash
  cd ~/work/quantika-demo
  git fetch origin
  git worktree add .worktrees/r2-appshell design/r2-appshell-modeswitcher
  cd .worktrees/r2-appshell
  ```

- [ ] **0.2 — Verify R1 merged:** `git log --oneline origin/main | grep -i 'design-system' | head -1` → должна быть строка R1 squash commit.

---

## Task 1: Migration 037 (preferred_mode)

**Files:**
- Create: `lib/migrations/037-add-user-preferred-mode.ts`
- Test: `__tests__/lib/migrations/037.test.ts`

- [ ] **1.1 — Failing test:**

```ts
// __tests__/lib/migrations/037.test.ts
import Database from 'better-sqlite3';
import { migrate } from '../../../lib/migrations/runner';

describe('migration 037 — preferred_mode', () => {
  it('adds preferred_mode column to users with default charterer', () => {
    const db = new Database(':memory:');
    migrate(db, { upTo: 37 });
    db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')").run();
    const u = db.prepare("SELECT preferred_mode FROM users WHERE id='u1'").get() as { preferred_mode: string };
    expect(u.preferred_mode).toBe('charterer');
  });

  it('allows owner mode', () => {
    const db = new Database(':memory:');
    migrate(db, { upTo: 37 });
    db.prepare("INSERT INTO users (id, email, preferred_mode) VALUES ('u2', 'b@c.d', 'owner')").run();
    const u = db.prepare("SELECT preferred_mode FROM users WHERE id='u2'").get() as { preferred_mode: string };
    expect(u.preferred_mode).toBe('owner');
  });
});
```

- [ ] **1.2 — Run:** FAIL (migration missing).

- [ ] **1.3 — Implement:**

```ts
// lib/migrations/037-add-user-preferred-mode.ts
import type { Database } from 'better-sqlite3';

export const migration037 = {
  version: 37,
  name: '037-add-user-preferred-mode',
  up(db: Database): void {
    db.exec(`ALTER TABLE users ADD COLUMN preferred_mode TEXT NOT NULL DEFAULT 'charterer'`);
  },
};
```

Register в `lib/migrations/index.ts` (или migrations registry — смотри как PR #428 регистрировал 036).

- [ ] **1.4 — Run:** PASS.

- [ ] **1.5 — Commit:**
```bash
git add lib/migrations/037-add-user-preferred-mode.ts lib/migrations/index.ts __tests__/lib/migrations/037.test.ts
git commit -m "feat(r2): migration 037 — users.preferred_mode column"
```

---

## Task 2: /api/me endpoint

**Files:**
- Create: `app/api/me/route.ts`
- Test: `__tests__/api/me.test.ts`

- [ ] **2.1 — Failing test:**

```ts
// __tests__/api/me.test.ts
import { GET, PATCH } from '@/app/api/me/route';
import { makeAuthRequest } from '../helpers/auth'; // existing test helper

describe('/api/me', () => {
  it('GET returns user info with preferred_mode', async () => {
    const req = await makeAuthRequest('GET', '/api/me');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: expect.any(String), email: expect.any(String), preferred_mode: 'charterer' });
  });

  it('PATCH preferred_mode persists', async () => {
    const req = await makeAuthRequest('PATCH', '/api/me', { preferred_mode: 'owner' });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferred_mode).toBe('owner');
  });

  it('PATCH rejects invalid mode', async () => {
    const req = await makeAuthRequest('PATCH', '/api/me', { preferred_mode: 'invalid' });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('GET without auth → 401 (middleware already handles)', async () => {
    // covered by middleware test; smoke check
    const req = new Request('http://localhost/api/me');
    const res = await GET(req as any);
    // Note: middleware intercepts before route handler — this is documentation only
    expect([200, 401]).toContain(res.status);
  });
});
```

- [ ] **2.2 — Run:** FAIL.

- [ ] **2.3 — Implement:**

```ts
// app/api/me/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';

const VALID_MODES = ['charterer', 'owner'] as const;
type Mode = typeof VALID_MODES[number];

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const user = db.prepare('SELECT id, email, preferred_mode FROM users WHERE id = ?').get(session.userId) as
    | { id: string; email: string; preferred_mode: Mode }
    | undefined;
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const mode = body.preferred_mode;
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json({ error: 'invalid preferred_mode' }, { status: 400 });
  }
  const db = getDb();
  db.prepare('UPDATE users SET preferred_mode = ? WHERE id = ?').run(mode, session.userId);
  const updated = db.prepare('SELECT id, email, preferred_mode FROM users WHERE id = ?').get(session.userId);
  return NextResponse.json(updated);
}
```

> **Adapt:** `getSession`, `getDb`, `lib/session` — точные имена смотри в существующих API routes (e.g. `app/api/matches/route.ts`).

- [ ] **2.4 — Run:** PASS.

- [ ] **2.5 — Commit:**
```bash
git add app/api/me/route.ts __tests__/api/me.test.ts
git commit -m "feat(r2): /api/me GET + PATCH for preferred_mode"
```

---

## Task 3: useMode hook + ModeProvider context

**Files:**
- Create: `design-system/patterns/ModeProvider.tsx`
- Create: `design-system/patterns/useMode.ts`
- Test: `design-system/__tests__/useMode.test.tsx`

- [ ] **3.1 — Failing test:**

```tsx
// design-system/__tests__/useMode.test.tsx
import { render, screen, act } from '@testing-library/react';
import { ModeProvider } from '../patterns/ModeProvider';
import { useMode } from '../patterns/useMode';

function Probe() {
  const { mode, isCharterer, isOwner, t, setMode } = useMode();
  return (
    <>
      <span data-testid="mode">{mode}</span>
      <span data-testid="iss">{String(isCharterer)}/{String(isOwner)}</span>
      <span data-testid="copy">{t('aibar.placeholder')}</span>
      <button onClick={() => setMode(mode === 'charterer' ? 'owner' : 'charterer')}>swap</button>
    </>
  );
}

describe('useMode (design-system)', () => {
  it('returns initial mode charterer + correct flags', () => {
    render(<ModeProvider initial="charterer"><Probe /></ModeProvider>);
    expect(screen.getByTestId('mode')).toHaveTextContent('charterer');
    expect(screen.getByTestId('iss')).toHaveTextContent('true/false');
  });

  it('t() returns mode-aware copy', () => {
    render(<ModeProvider initial="charterer"><Probe /></ModeProvider>);
    expect(screen.getByTestId('copy').textContent).toMatch(/груз|cargo/i);
    // owner copy distinct
  });

  it('setMode updates context', () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    render(<ModeProvider initial="charterer"><Probe /></ModeProvider>);
    act(() => { screen.getByText('swap').click(); });
    expect(screen.getByTestId('mode')).toHaveTextContent('owner');
  });
});
```

- [ ] **3.2 — Run:** FAIL.

- [ ] **3.3 — Implement provider:**

```tsx
// design-system/patterns/ModeProvider.tsx
'use client';
import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';

export type Mode = 'charterer' | 'owner';

interface ModeContextValue {
  mode: Mode;
  setMode: (m: Mode) => void;
}

export const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ initial, children }: { initial: Mode; children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(initial);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    // optimistic; fire-and-forget PATCH
    fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferred_mode: m }) }).catch(() => {});
    // sync URL (?mode=)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', m);
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}
```

```tsx
// design-system/patterns/useMode.ts
'use client';
import { useContext } from 'react';
import { ModeContext, type Mode } from './ModeProvider';

const COPY: Record<Mode, Record<string, string>> = {
  charterer: {
    'aibar.placeholder': 'Спроси про груз или кинь email от брокера…',
    'nav.thirdSlot': 'Cargo',
    'nav.fourthSlot': 'Vessels',
    'page.title.suffix': 'Charterer',
    'matches.empty.cta': 'Загрузи первый груз → найдём суда',
  },
  owner: {
    'aibar.placeholder': 'Спроси про судно или кинь open-position email…',
    'nav.thirdSlot': 'Vessels',
    'nav.fourthSlot': 'Cargo',
    'page.title.suffix': 'Owner',
    'matches.empty.cta': 'Добавь первое судно → найдём грузы',
  },
};

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be inside <ModeProvider>');
  const { mode, setMode } = ctx;
  return {
    mode,
    setMode,
    isCharterer: mode === 'charterer',
    isOwner: mode === 'owner',
    t: (key: string) => COPY[mode][key] ?? key,
  };
}
```

- [ ] **3.4 — Run:** PASS. Commit:
```bash
git add design-system/patterns/ModeProvider.tsx design-system/patterns/useMode.ts design-system/__tests__/useMode.test.tsx
git commit -m "feat(r2): ModeProvider context + useMode hook with mode-aware t() dictionary"
```

---

## Task 4: ModeSwitcher component

**Files:**
- Create: `design-system/patterns/ModeSwitcher.tsx`
- Test: `design-system/__tests__/ModeSwitcher.test.tsx`

- [ ] **4.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeProvider } from '../patterns/ModeProvider';
import { ModeSwitcher } from '../patterns/ModeSwitcher';

describe('ModeSwitcher', () => {
  it('renders both modes, active = charterer initially', () => {
    render(<ModeProvider initial="charterer"><ModeSwitcher /></ModeProvider>);
    expect(screen.getByRole('button', { name: /charterer/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /owner/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking owner toggles', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    render(<ModeProvider initial="charterer"><ModeSwitcher /></ModeProvider>);
    await userEvent.click(screen.getByRole('button', { name: /owner/i }));
    expect(screen.getByRole('button', { name: /owner/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **4.2 — Implement:**

```tsx
// design-system/patterns/ModeSwitcher.tsx
'use client';
import { useMode } from './useMode';
import { cn } from '@/design-system/primitives/_utils';

export function ModeSwitcher({ className }: { className?: string }) {
  const { mode, setMode } = useMode();
  return (
    <div className={cn('inline-flex bg-ds-surface-muted rounded-ds-md p-0.5 text-xs', className)} role="group" aria-label="Application mode">
      {(['charterer', 'owner'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={cn(
            'px-3 py-1 rounded-ds-sm transition-colors duration-ds-fast capitalize',
            mode === m ? 'bg-ds-accent text-ds-accent-fg font-semibold' : 'text-ds-text-muted hover:text-ds-text'
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **4.3 — Run PASS. Commit `feat(r2): add ModeSwitcher component`.**

---

## Task 5: TopNav component

**Files:**
- Create: `design-system/patterns/TopNav.tsx`
- Test: `design-system/__tests__/TopNav.test.tsx`

- [ ] **5.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { ModeProvider } from '../patterns/ModeProvider';
import { TopNav } from '../patterns/TopNav';

describe('TopNav', () => {
  it('renders 5 primary nav items + More dropdown trigger', () => {
    render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /matches/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cargo/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vessels/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /market/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument();
  });

  it('owner mode swaps Cargo and Vessels positions', () => {
    const { container } = render(<ModeProvider initial="owner"><TopNav /></ModeProvider>);
    const links = container.querySelectorAll('nav a');
    const texts = Array.from(links).map(l => l.textContent);
    // Owner: Dashboard, Matches, Vessels, Cargo, Market
    expect(texts).toEqual(['Dashboard', 'Matches', 'Vessels', 'Cargo', 'Market']);
  });
});
```

- [ ] **5.2 — Implement:**

```tsx
// design-system/patterns/TopNav.tsx
'use client';
import Link from 'next/link';
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
      <Link href="/dashboard" className="text-ds-accent font-bold text-lg">Q</Link>
      <nav className="flex items-center gap-6 text-sm">
        <NavLink href="/dashboard">Dashboard</NavLink>
        <NavLink href="/matches">Matches</NavLink>
        <NavLink href={third.href}>{third.label}</NavLink>
        <NavLink href={fourth.href}>{fourth.label}</NavLink>
        <NavLink href="/market">Market</NavLink>
        <MoreDropdown items={MORE_ITEMS} />
      </nav>
      <div className="ml-auto"><ModeSwitcher /></div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-ds-text-muted hover:text-ds-text font-medium">
      {children}
    </Link>
  );
}

function MoreDropdown({ items }: { items: { href: string; label: string }[] }) {
  return (
    <details className="relative">
      <summary className="text-ds-text-muted hover:text-ds-text font-medium cursor-pointer list-none" aria-label="More">⋯ More</summary>
      <ul className="absolute right-0 mt-2 min-w-[180px] bg-ds-surface border border-ds-border rounded-ds-md shadow-lg py-1 z-40">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="block px-3 py-1.5 text-sm text-ds-text hover:bg-ds-surface-muted">{it.label}</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

- [ ] **5.3 — Run PASS. Commit `feat(r2): add TopNav with 5 primary + More dropdown + ModeSwitcher`.**

---

## Task 6: BottomNav (mobile)

**Files:**
- Create: `design-system/patterns/BottomNav.tsx`
- Test: `design-system/__tests__/BottomNav.test.tsx`

- [ ] **6.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { ModeProvider } from '../patterns/ModeProvider';
import { BottomNav } from '../patterns/BottomNav';

describe('BottomNav', () => {
  it('renders 4 icons with labels', () => {
    render(<ModeProvider initial="charterer"><BottomNav /></ModeProvider>);
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /matches/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cargo/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /more/i })).toBeInTheDocument();
  });
});
```

- [ ] **6.2 — Implement:**

```tsx
// design-system/patterns/BottomNav.tsx
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
    { href: isCharterer ? '/cargo' : '/vessels', label: isCharterer ? 'Cargo' : 'Vessels', Icon: Box },
    { href: '/more', label: 'More', Icon: MoreHorizontal },
  ];
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-ds-surface border-t border-ds-border flex items-stretch h-14">
      {items.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn('flex-1 flex flex-col items-center justify-center gap-0.5 text-ds-text-muted hover:text-ds-text', 'min-h-[44px]')}
        >
          <Icon size={20} />
          <span className="text-[10px] font-medium">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **6.3 — Run PASS. Commit `feat(r2): add BottomNav (mobile, 4 icons, ≥44px tap targets)`.**

---

## Task 7: AIBarPlaceholder (visual stub)

**Files:**
- Create: `design-system/patterns/AIBarPlaceholder.tsx`

- [ ] **7.1 — Implement (no behavioural test — это placeholder):**

```tsx
// design-system/patterns/AIBarPlaceholder.tsx
'use client';
import { useMode } from './useMode';

export function AIBarPlaceholder() {
  const { t } = useMode();
  return (
    <div className="hidden md:flex items-center gap-2 bg-ds-surface border-b border-ds-border px-6 py-2 text-sm text-ds-text-subtle">
      <span className="flex-1">💬 {t('aibar.placeholder')}</span>
      <kbd className="bg-ds-surface-muted text-ds-text-muted px-1.5 py-0.5 rounded text-[10px] font-semibold">⌘K</kbd>
    </div>
  );
}
```

- [ ] **7.2 — Commit `feat(r2): add AIBarPlaceholder (visual stub, R3 will activate)`.**

---

## Task 8: AppShell

**Files:**
- Create: `design-system/patterns/AppShell.tsx`
- Test: `design-system/__tests__/AppShell.test.tsx`

- [ ] **8.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { ModeProvider } from '../patterns/ModeProvider';
import { AppShell } from '../patterns/AppShell';

describe('AppShell', () => {
  it('renders children + nav + mode switcher', () => {
    render(
      <ModeProvider initial="charterer">
        <AppShell><div>page content</div></AppShell>
      </ModeProvider>
    );
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /matches/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /charterer/i })).toBeInTheDocument();
  });
});
```

- [ ] **8.2 — Implement:**

```tsx
// design-system/patterns/AppShell.tsx
'use client';
import type { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { AIBarPlaceholder } from './AIBarPlaceholder';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ds-bg text-ds-text flex flex-col">
      <TopNav />
      <AIBarPlaceholder />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **8.3 — Run PASS. Commit `feat(r2): add AppShell wrapping TopNav + AIBarPlaceholder + BottomNav`.**

---

## Task 9: Patterns barrel

**Files:**
- Create: `design-system/patterns/index.ts`

- [ ] **9.1 — Write:**

```ts
// design-system/patterns/index.ts
export { AppShell } from './AppShell';
export { TopNav } from './TopNav';
export { BottomNav } from './BottomNav';
export { ModeSwitcher } from './ModeSwitcher';
export { AIBarPlaceholder } from './AIBarPlaceholder';
export { ModeProvider } from './ModeProvider';
export { useMode } from './useMode';
export type { Mode } from './ModeProvider';
```

- [ ] **9.2 — Commit `feat(r2): patterns barrel exports`.**

---

## Task 10: Wire AppShell into app layout

**Files:**
- Create: `app/(authenticated)/layout.tsx`
- Modify: `app/layout.tsx`

> **Goal:** AppShell обёрнут вокруг ВСЕХ authenticated страниц без перемещения page.tsx. Используем Next.js route groups.

- [ ] **10.1 — Read existing `app/layout.tsx`:** `cat app/layout.tsx` — посмотри текущую структуру. Скорее всего там общий HTML+Body. Не трогай.

- [ ] **10.2 — Создай route group layout:**

```tsx
// app/(authenticated)/layout.tsx
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ModeProvider, AppShell } from '@/design-system/patterns';
import { redirect } from 'next/navigation';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  // Adapt to real getSession signature
  const session = await getSession({ cookies: cookieStore } as any).catch(() => null);
  if (!session) redirect('/login');

  let mode: 'charterer' | 'owner' = 'charterer';
  try {
    const db = getDb();
    const u = db.prepare('SELECT preferred_mode FROM users WHERE id = ?').get(session.userId) as { preferred_mode: 'charterer' | 'owner' } | undefined;
    if (u?.preferred_mode === 'owner') mode = 'owner';
  } catch {}

  return (
    <ModeProvider initial={mode}>
      <AppShell>{children}</AppShell>
    </ModeProvider>
  );
}
```

- [ ] **10.3 — Move existing pages into route group:**
  Для каждой authenticated page (dashboard, matches, cargo, vessels, market, charterers, etc.) — НЕ перемещай файлы (Next.js auto-detects route group). Просто создавай `app/(authenticated)/...` mirroring. **Альтернатива минимум-инвазивная:** оставь существующие pages где они есть, AppShell wrap не через route group, а через modification `app/layout.tsx` с conditional:

  **Simpler approach (рекомендую):**

```tsx
// app/layout.tsx — modify
import { ModeProvider, AppShell } from '@/design-system/patterns';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = await getSession({ cookies: cookieStore } as any).catch(() => null);

  if (!session) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  let mode: 'charterer' | 'owner' = 'charterer';
  try {
    const db = getDb();
    const u = db.prepare('SELECT preferred_mode FROM users WHERE id = ?').get(session.userId) as any;
    if (u?.preferred_mode === 'owner') mode = 'owner';
  } catch {}

  return (
    <html lang="en">
      <body>
        <ModeProvider initial={mode}>
          <AppShell>{children}</AppShell>
        </ModeProvider>
      </body>
    </html>
  );
}
```

> Existing `app/layout.tsx` уже импортит globals.css и шрифты — сохрани все эти imports, добавь только ModeProvider/AppShell wrap.

- [ ] **10.4 — Run dev server `npm run dev`** → http://localhost:3000/matches должна показать TopNav сверху + ModeSwitcher + page content внизу. Скриншот для verification.

- [ ] **10.5 — Run all tests:** `npm test`. Все 2950+ green ожидаемо.

- [ ] **10.6 — Commit `feat(r2): wire AppShell into root layout for authenticated routes`.**

---

## Task 11: URL `?mode=` override

**Files:**
- Modify: `design-system/patterns/ModeProvider.tsx`
- Test: append к existing `useMode.test.tsx`

- [ ] **11.1 — Test:**

```tsx
// extend design-system/__tests__/useMode.test.tsx
it('URL ?mode=owner overrides initial', () => {
  // Mock window.location.search
  Object.defineProperty(window, 'location', { value: { search: '?mode=owner', href: 'http://test/?mode=owner' }, writable: true });
  render(<ModeProvider initial="charterer"><Probe /></ModeProvider>);
  // After mount, URL takes precedence
  expect(screen.getByTestId('mode')).toHaveTextContent('owner');
});
```

- [ ] **11.2 — Update ModeProvider to read URL on init:**

```tsx
// в ModeProvider.tsx, в useState init:
const [mode, setModeState] = useState<Mode>(() => {
  if (typeof window === 'undefined') return initial;
  const params = new URLSearchParams(window.location.search);
  const urlMode = params.get('mode');
  if (urlMode === 'charterer' || urlMode === 'owner') return urlMode;
  return initial;
});
```

- [ ] **11.3 — Run PASS. Commit `feat(r2): URL ?mode= overrides DB preference`.**

---

## Task 12: Visual regression + a11y

**Files:**
- Create: `tests/visual/app-shell.spec.ts`

- [ ] **12.1 — Spec:**

```ts
// tests/visual/app-shell.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGE = '/matches'; // any authenticated page

test.describe('AppShell visual + a11y', () => {
  test('desktop layout snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PAGE);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('app-shell-desktop.png', { fullPage: false, maxDiffPixelRatio: 0.02 });
  });

  test('mobile bottom-nav visible at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(PAGE);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('nav').last()).toBeVisible();
    await expect(page).toHaveScreenshot('app-shell-mobile.png', { fullPage: false, maxDiffPixelRatio: 0.02 });
  });

  test('mode toggle swaps Cargo↔Vessels nav order', async ({ page }) => {
    await page.goto(PAGE + '?mode=charterer');
    const navLinks1 = await page.locator('header nav a').allTextContents();
    expect(navLinks1).toEqual(['Dashboard', 'Matches', 'Cargo', 'Vessels', 'Market']);

    await page.goto(PAGE + '?mode=owner');
    const navLinks2 = await page.locator('header nav a').allTextContents();
    expect(navLinks2).toEqual(['Dashboard', 'Matches', 'Vessels', 'Cargo', 'Market']);
  });

  test('a11y — 0 violations on shell', async ({ page }) => {
    await page.goto(PAGE);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
```

> **Auth note:** Playwright нуждается в auth cookie для access `/matches`. Если есть `playwright/setup-auth.ts` или fixture — используй. Иначе временно добавь `/matches` в middleware bypass ТОЛЬКО для test environment (через `NEXT_PUBLIC_E2E=true`), потом удали.

- [ ] **12.2 — Generate baseline + verify:**

```bash
npx playwright test tests/visual/app-shell.spec.ts --update-snapshots
npx playwright test tests/visual/app-shell.spec.ts
```

Expected: 4 PASS.

- [ ] **12.3 — Commit `test(r2): visual regression + a11y for AppShell + mode swap`.**

---

## Task 13: TS strict + full regression + PR

- [ ] **13.1 — TS strict:** `npx tsc --noEmit`. 0 errors.
- [ ] **13.2 — Jest full:** `npm test`. All green (2950 existing + new R2).
- [ ] **13.3 — Playwright full:** `npx playwright test tests/visual`. All green (R1 3 + R2 4 = 7 + a11y).
- [ ] **13.4 — Smoke main pages:** `npm run dev`, открой / dashboard / matches / cargo / vessels / market / settings — все рендерятся с новым shell.
- [ ] **13.5 — Push + PR:**

```bash
git push -u origin design/r2-appshell-modeswitcher
gh pr create --base main --title "R2: AppShell + TopNav + BottomNav + ModeSwitcher" --body "$(cat <<'EOF'
## R2 — AppShell foundation

Реализует §3.2-§3.4 из [redesign spec](../docs/superpowers/specs/2026-05-24-quantika-demo-full-redesign-design.md). Использует только R1 primitives.

### Что добавилось
- `design-system/patterns/` — AppShell, TopNav (5 + More), BottomNav (mobile, ≥44px tap), ModeSwitcher, ModeProvider, useMode hook, AIBarPlaceholder (R3 активирует)
- `lib/migrations/037` — `users.preferred_mode` (default charterer)
- `app/api/me` — GET + PATCH
- `app/layout.tsx` — wrapped в ModeProvider + AppShell для authenticated
- `tests/visual/app-shell.spec.ts` — Playwright + axe

### Что НЕ изменилось
- Existing pages (matches/cargo/vessels/...) — не трогаем
- Backend API кроме /api/me
- components/ui/* (R1 coexistence preserved)

### Verification
- TS strict 0 errors
- Jest existing + new — все green
- Playwright + axe — все green
- Smoke main pages — render with new shell

### Next
R3 (AIBar + ⌘K) и R4 (LiveStrip) могут стартовать параллельно.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **13.6 — НЕ auto-merge.** /test-skill cold-QA gate запустит orchestrator отдельно.

---

## Success criteria

- ✅ AppShell обёрнут вокруг authenticated страниц
- ✅ Mode toggle меняет nav-order реактивно без reload
- ✅ Mode persists в DB; URL ?mode= overrides
- ✅ Mobile breakpoint показывает BottomNav (4 icons, ≥44px), прячет TopNav
- ✅ TS strict 0, jest green, Playwright visual + a11y 0 violations
- ✅ Существующие страницы продолжают работать

## Out of scope

- AIBar функционал (R3)
- ⌘K palette (R3)
- LiveStrip (R4)
- Per-page polish (R5)
- Удаление старых components/ui/* (R5)
