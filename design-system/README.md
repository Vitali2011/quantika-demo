# Design System (R1)

Parallel design-system слой для Quantika Demo. Создан 2026-05-24, см.
[spec](../docs/superpowers/specs/2026-05-24-quantika-demo-full-redesign-design.md).

## Структура

- `tokens/*.css` — semantic CSS variables (`--ds-*`)
- `primitives/*.tsx` — React-компоненты, низкоуровневые атомы
- `__tests__/*.test.tsx` — jest tests (behaviour)
- `/app/design` — internal preview (visual gallery)

## Как использовать

```tsx
import { Button, Card, Badge } from '@/design-system/primitives';

<Card>
  <Badge variant="success">Active</Badge>
  <Button>Action</Button>
</Card>
```

## Tailwind

Tokens доступны как `bg-ds-accent`, `text-ds-text-muted`, `border-ds-border`, `rounded-ds-md`, и т.д.
Полный список — `tailwind.config.ts`, section `ds.*`.

## Когда добавлять primitive vs использовать pattern

- **Primitive** = атом без бизнес-логики (Button, Input, Card). Если переиспользуется в 3+ местах в разных контекстах.
- **Pattern** = композиция primitives + бизнес-смысл (LiveStrip, StatCard, ModeSwitcher). Живёт в `design-system/patterns/` (создаётся в R3+).

Если что-то нужно в 1 месте — не делай primitive, держи inline.

## Maritime Deep палитра

- Primary brand = `--ds-accent` (#0f172a navy)
- Highlights/interactive = `--ds-accent-fg` (#fbbf24 amber)
- **Amber используем только для interactive accent** (active tab, primary button label,
  high-value pill). Никаких больших amber-блоков — продукт начнёт выглядеть «военно».

## Coexistence with `components/ui/*` (shadcn)

R1 НЕ удаляет старые компоненты. Они продолжают работать на существующих страницах.
В R5 (per-section polish) страницы постепенно мигрируют с `components/ui/Button` на
`design-system/primitives/Button`. После последней миграции — `components/ui/*` удаляется
одним PR.

**Не используй design-system и shadcn в одном новом компоненте** — выбирай одно.

## Dark mode (prep, not active)

Token overrides for `[data-theme="dark"]` are defined in `tokens/colors.css`.
To activate, set `data-theme="dark"` on `<html>`. No toggle UI is implemented yet (R6.5).

Key dark overrides:
- `--ds-bg: #0f172a` (slate-950)
- `--ds-surface: #1e293b` (slate-800)
- `--ds-accent: #fbbf24` → inverted: amber becomes the primary button, navy becomes fg
- All semantic colors adjusted for dark-background contrast

## A11y

- Skip-to-content link is rendered in `AppShell` — visually hidden until focused
- All icon-only buttons carry `aria-label`
- Transitions use `--ds-motion-*` tokens; `prefers-reduced-motion` zeros all durations
- Axe baseline specs: `tests/a11y/pages/` (run via `npm run test:a11y`)

## Tests

```bash
npm test -- design-system          # unit tests (jest)
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/visual --config playwright.config.visual.ts  # visual regression + a11y
```

Visual baseline хранится в `tests/visual/design-page.spec.ts-snapshots/`. Обновлять
через `--update-snapshots` только когда design правда изменился, не для починки flaky
tests.
