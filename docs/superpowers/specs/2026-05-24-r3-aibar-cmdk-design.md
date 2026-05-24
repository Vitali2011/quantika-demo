# R3 — AIBar + ⌘K Palette (Design Spec)

**Дата:** 2026-05-24
**Parent:** §3.4 + §5a-#1 + экран 14 (AI chat-help)
**Depends:** R1 primitives, R2 AppShell/useMode

## 1. Цель

Заменить R2 `AIBarPlaceholder` на работающий компонент:
- Persistent visible search-bar в shell (mode-aware placeholder)
- ⌘K (Cmd+K / Ctrl+K) → full-width palette с 3 категориями
- Floating "?" Help-кнопка в bottom-right (использует тот же palette с tab='Help')

## 2. Palette UX

| Tab | Содержимое | Источник данных |
|---|---|---|
| **Actions** | "Find vessel for 47k HSS Constanta", "Generate recap", "Show market HSS", ... mode-aware list | hardcoded `ACTIONS` array + handler per item |
| **Navigate** | Quick-jump в любую page (matches, cargo, vessels, market, settings, …) + last 5 matches | static route list + recent localStorage |
| **Help** (AI-chat) | Free-text question → AI ответ через RAG (`/api/knowledge/ask`) | streaming response |
| **Recents** | Last 5 user actions (visited pages, opened matches) | localStorage |

Поведение:
- ⌘K на любой странице → palette opens
- Type → fuzzy-filter actions+navigate; ≥3 chars → fire RAG search для Help
- Esc / outside-click → close
- Enter → execute selected
- Arrow keys → navigate items

## 3. AIBar (always visible)

В `AppShell` место `AIBarPlaceholder` заменяется на `<AIBar />`:
- Click on input → opens palette
- ⌘K kbd shortcut → opens palette
- Mobile: collapsed icon (🔍) tap → opens palette as full-screen sheet

## 4. Floating Help button (bottom-right)

```tsx
<HelpFAB />  // visible on all pages except /login, /
```
Click → opens palette с pre-selected Help tab + auto-focus input.

## 5. Backend

- Reuse existing `/api/knowledge/ask` if exists (Knowledge Phase 2 RAG)
- Иначе создать lightweight `/api/help/ask` proxy

```ts
// POST /api/help/ask { query: string }
// → { answer: string, sources: { title, url }[] }
```

Streaming через Server-Sent-Events опционально (для UX можно сделать non-streaming в R3, streaming в R6 polish).

## 6. Files

```
design-system/patterns/
├── AIBar.tsx              — replaces AIBarPlaceholder
├── CmdKPalette.tsx        — modal/dialog (Dialog primitive)
├── PaletteTabs/
│   ├── ActionsTab.tsx
│   ├── NavigateTab.tsx
│   ├── HelpTab.tsx
│   └── RecentsTab.tsx
├── HelpFAB.tsx
├── usePalette.ts          — open/close state + ⌘K listener
└── __tests__/
    ├── AIBar.test.tsx
    ├── CmdKPalette.test.tsx
    └── usePalette.test.tsx

app/api/help/ask/
└── route.ts               — POST handler (proxy to /api/knowledge/ask или own RAG)
```

MODIFIED:
- `design-system/patterns/AppShell.tsx` — replace `AIBarPlaceholder` → `AIBar` + add `HelpFAB`
- `design-system/patterns/index.ts` — export AIBar, CmdKPalette, HelpFAB

## 7. Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open palette |
| `Esc` | Close |
| `↑` `↓` | Navigate items |
| `Enter` | Execute selected |
| `Tab` | Switch palette tabs |

## 8. Success criteria

- ⌘K из любой page → palette opens, focus в input
- Type "matches" → Navigate tab фильтрует, Enter → router.push('/matches')
- Type free-text question + Tab to Help → RAG answer rendered
- Mobile: AIBar icon → full-screen sheet
- HelpFAB на /dashboard виден, на /login — нет
- TS strict, jest, Playwright + axe — green

## 9. Out of scope

- Streaming SSE для RAG answer (R6 polish)
- Voice input (R6 nice-to-have)
- Multi-language help (i18n не делаем)
- Persistent chat history (R3 = stateless per-open)

## 10. Risks

| Risk | Mitigation |
|---|---|
| ⌘K conflict с browser default (search) | preventDefault в keydown |
| RAG endpoint slow → palette laggy | Show skeleton in Help tab; non-blocking; timeout 8s → "try later" |
| HelpFAB overlaps content на small screens | bottom-right with padding, suppress на BottomNav routes |
| Recents leak between users | localStorage scoped by user_id (key `recents:${userId}`) |
