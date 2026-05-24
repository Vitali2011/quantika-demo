# R2 — AppShell + IA + ModeSwitcher (Design Spec)

**Дата:** 2026-05-24
**Статус:** Draft → ready for plan
**Parent spec:** [2026-05-24-quantika-demo-full-redesign-design.md](2026-05-24-quantika-demo-full-redesign-design.md) §3.2, §3.3, §5a-#2

## 1. Цель

Обернуть приложение в единый AppShell с:
- Top-nav из 5 primary + dropdown "More"
- Persistent ModeSwitcher (charterer ↔ owner) с URL `?mode=` + DB persist
- Mobile bottom-nav (4 иконки) replace top-nav на ≤768px
- AI-bar placeholder (visual только; функционал в R3)
- Использует **только** primitives из R1 (design-system/)

Не трогаем: бизнес-логика, parsers, matching, R5 per-section polish.

## 2. Layout (из brainstorm экран 1-2)

### Desktop (≥769px)

```
┌─────────────────────────────────────────────────────────────┐
│ Q │ Dashboard · Matches · Cargo · Vessels · Market  ⋯ More │ TopNav
│                                       [Charterer|Owner]    │ ModeSwitcher
├─────────────────────────────────────────────────────────────┤
│  🔍 Ask anything…                                      ⌘K  │ AIBar (placeholder)
├─────────────────────────────────────────────────────────────┤
│  Page content (children)                                    │
└─────────────────────────────────────────────────────────────┘
```

### Mobile (≤768px)

```
┌──────────────────────────┐
│ Q  Quantika    [Mode 🍔] │ Compact top + drawer trigger
├──────────────────────────┤
│ Page content             │
│                          │
├──────────────────────────┤
│ 🏠   ✨    📦    ⋯       │ BottomNav (Dashboard / Matches / Cargo+Vessels / More)
└──────────────────────────┘
```

## 3. Mode awareness

| Element | Charterer mode | Owner mode |
|---|---|---|
| Top-nav slot 3 | **Cargo** | **Vessels** |
| Top-nav slot 4 | **Vessels** | **Cargo** |
| AIBar placeholder | «Спроси про груз или кинь email…» | «Спроси про судно или кинь open-position email…» |
| Page meta (`<title>`) | "Quantika — Charterer" | "Quantika — Owner" |
| Match list sort default | by score | by TCE |

Mode hook возвращает `{ mode: 'charterer'|'owner', setMode: (m) => void, isCharterer: boolean, isOwner: boolean, t: (key) => string }`.

`t()` — mode-aware copy lookup. Hardcoded dictionary в `useMode.ts` (i18n не делаем сейчас).

## 4. Data flow

### `users.preferred_mode`

Migration `037-add-user-preferred-mode.ts`:
```sql
ALTER TABLE users ADD COLUMN preferred_mode TEXT NOT NULL DEFAULT 'charterer';
```

### `/api/me`

```ts
// GET /api/me → { id, email, preferred_mode }
// PATCH /api/me { preferred_mode: 'charterer'|'owner' } → updated user
```

Both endpoints auth-gated (existing middleware), session-isolated.

### URL state

`?mode=charterer` или `?mode=owner` overrides DB preference for current view. Shareable links. Не персистит.

Mode-resolve order:
1. URL `?mode=` если present
2. DB `users.preferred_mode`
3. Default `'charterer'` (новые юзеры)

### React Context

```tsx
// design-system/patterns/ModeProvider.tsx
<ModeProvider initial={mode}>
  {children}
</ModeProvider>

// usage
const { mode, setMode, isCharterer, t } = useMode();
```

`setMode()` оптимистично обновляет context + URL + fire-and-forget PATCH.

## 5. Files (R2 = ~20 файлов)

### NEW

```
design-system/patterns/
├── AppShell.tsx           — layout wrapper
├── TopNav.tsx             — desktop nav (5 + More)
├── BottomNav.tsx          — mobile nav (4 icons)
├── ModeSwitcher.tsx       — toggle button
├── ModeProvider.tsx       — React Context
├── useMode.ts             — hook + t() dictionary
├── AIBarPlaceholder.tsx   — visual only (interactive in R3)
└── __tests__/
    ├── AppShell.test.tsx
    ├── TopNav.test.tsx
    ├── ModeSwitcher.test.tsx
    └── useMode.test.tsx

lib/migrations/
└── 037-add-user-preferred-mode.ts

app/api/me/
└── route.ts               — GET + PATCH

tests/visual/
└── app-shell.spec.ts      — Playwright shell + mode toggle
```

### MODIFIED

```
app/layout.tsx             — wrap всё в ModeProvider если user authenticated
                            (или create app/(authenticated)/layout.tsx group)
middleware.ts              — добавить /api/me (auth required, no bypass)
```

Существующие страницы (matches/cargo/etc.) **НЕ ТРОГАЕМ**. AppShell обернёт их через layout-route без изменений в page.tsx.

## 6. Responsive strategy

Tailwind breakpoints (existing):
- `<768px` = mobile → BottomNav active, TopNav hidden
- `≥768px` = desktop → TopNav active, BottomNav hidden

Mode-switcher:
- Desktop: top-right в TopNav
- Mobile: внутри drawer (hamburger в compact top)

## 7. Routes

R2 НЕ переписывает существующие routes. Только добавляет AppShell wrap. Slot mapping в TopNav обрабатывается через `useMode()`:

```tsx
const navItems = isCharterer
  ? [...primary, 'Cargo', 'Vessels', ...]
  : [...primary, 'Vessels', 'Cargo', ...];
```

## 8. Success criteria

- ✅ `<AppShell>` обёрнут вокруг всех authenticated страниц
- ✅ Mode toggle меняет nav-order реактивно (без reload)
- ✅ Mode persists в DB после reload, URL `?mode=` overrides
- ✅ Mobile breakpoint показывает BottomNav, прячет TopNav
- ✅ TS strict 0 errors, jest + Playwright visual + axe green
- ✅ Существующие страницы продолжают работать (regression check)

## 9. Out of scope

- ❌ AIBar функционал (R3)
- ❌ ⌘K palette (R3)
- ❌ LiveStrip (R4)
- ❌ Per-page polish (R5)
- ❌ Удаление старых components/ui/* (R5 финал)
- ❌ Page-level layout reorgs (только shell wrap)

## 10. Risks

| Risk | Mitigation |
|---|---|
| Mode toggle ломает существующие страницы (рассчитывают на одну роль) | AppShell не trigger'ит refetch — старые pages игнорируют mode пока не мигрированы в R5 |
| Layout shift при mode switch | CSS-only nav swap, no re-mount |
| Migration 037 на проде | NOT NULL DEFAULT 'charterer' — backward-compatible |
| /api/me race на init | useMode hook lazy-load, suspense fallback |

## 11. Next

R2 merged → R3 (AIBar + ⌘K) и R4 (LiveStrip) могут стартовать параллельно.
