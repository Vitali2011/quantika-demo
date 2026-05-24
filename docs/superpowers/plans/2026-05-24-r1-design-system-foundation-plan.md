# R1 — Design-System Foundation · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать parallel design-system слой (`design-system/`) с Maritime Deep палитрой, 16 primitives, preview-страницей `/design`, visual regression + a11y тестами. Существующие `components/ui/*` и страницы НЕ трогаем.

**Architecture:** Token-CSS (`--bg`, `--surface`, `--accent`, …) → Tailwind semantic colors → React primitives (variants via `class-variance-authority`, base-ui для overlays). Preview-страница `/design` рендерит все primitives + tokens; Playwright делает `toHaveScreenshot()` snapshots; `@axe-core/playwright` ловит a11y violations.

**Tech Stack:** Next.js 16, Tailwind 3.4, base-ui/react 1.4 (overlays), class-variance-authority, tailwind-merge, clsx, lucide-react, Playwright 1.60, jest 30, @axe-core/playwright (новое).

**Spec:** [/docs/superpowers/specs/2026-05-24-quantika-demo-full-redesign-design.md](../specs/2026-05-24-quantika-demo-full-redesign-design.md) §3.1, §6.

**Branch:** `design/full-redesign-spec-r1` (уже создан, спека закоммичена).

**Tier:** M · ~25 файлов · ~5-7 рабочих дней. Mid-risk = новый слой параллельно, не ломает прод.

---

## Pre-flight (для subagent'а перед стартом)

- [ ] **0.1 — Worktree** (только если работаешь через subagent-driven-development).
  Создай worktree:
  ```bash
  cd ~/work/quantika-demo
  git fetch origin
  git worktree add .worktrees/r1-design-system design/full-redesign-spec-r1
  cd .worktrees/r1-design-system
  ```

- [ ] **0.2 — Install missing dep `@axe-core/playwright`.**
  ```bash
  npm install --save-dev @axe-core/playwright
  ```
  Verify: `grep '"@axe-core/playwright"' package.json` → выводит строку. Commit:
  ```bash
  git add package.json package-lock.json
  git commit -m "chore(r1): add @axe-core/playwright for a11y tests"
  ```

---

## File Structure (план декомпозиции)

```
design-system/
├── tokens/
│   ├── colors.css        — Maritime Deep semantic tokens
│   ├── typography.css    — type scale (12-32px), weights, line-heights
│   ├── spacing.css       — 4px-base scale (--space-0 … --space-16)
│   ├── radius.css        — sm/md/lg/full
│   ├── motion.css        — durations + easings
│   └── index.css         — @imports all of the above
├── primitives/
│   ├── _utils.ts         — re-export `cn` + `cva` types
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Textarea.tsx
│   ├── Select.tsx
│   ├── Badge.tsx
│   ├── Pill.tsx
│   ├── Card.tsx
│   ├── Skeleton.tsx
│   ├── Avatar.tsx
│   ├── Toast.tsx
│   ├── Dialog.tsx
│   ├── Sheet.tsx
│   ├── Tabs.tsx
│   ├── Switch.tsx
│   ├── Tooltip.tsx
│   └── index.ts          — barrel exports
├── __tests__/
│   ├── Button.test.tsx
│   ├── Input.test.tsx
│   └── … (по тесту на каждый primitive с behaviour)
└── README.md             — usage guidelines, when-primitive-vs-pattern

app/design/
└── page.tsx              — internal preview, не в nav

tests/visual/
├── design-page.spec.ts   — Playwright visual snapshots
└── design-page-a11y.spec.ts — axe a11y

Modified:
- tailwind.config.ts      — добавить semantic colors mapped to --tokens
- app/globals.css         — import design-system/tokens/index.css
- playwright.config.ts    — обеспечить screenshot baseline (создать если нет)
```

---

## Task 1: Tokens (5 CSS файлов + index)

**Files:**
- Create: `design-system/tokens/colors.css`
- Create: `design-system/tokens/typography.css`
- Create: `design-system/tokens/spacing.css`
- Create: `design-system/tokens/radius.css`
- Create: `design-system/tokens/motion.css`
- Create: `design-system/tokens/index.css`

- [ ] **Step 1.1 — Write `design-system/tokens/colors.css`:**

```css
/* Maritime Deep — semantic tokens */
:root {
  /* Surface */
  --ds-bg: #f8fafc;          /* slate-50 — page background */
  --ds-surface: #ffffff;     /* cards, panels */
  --ds-surface-muted: #fafbfc;
  --ds-border: #e2e8f0;      /* slate-200 */
  --ds-border-strong: #cbd5e1;

  /* Text */
  --ds-text: #0f172a;        /* slate-900 — primary text */
  --ds-text-muted: #64748b;  /* slate-500 */
  --ds-text-subtle: #94a3b8; /* slate-400 — captions */

  /* Brand accent — navy + amber */
  --ds-accent: #0f172a;          /* primary buttons, active tab */
  --ds-accent-fg: #fbbf24;       /* amber-400 — text on accent, highlights */
  --ds-accent-soft: #fef3c7;     /* amber-100 — soft pills/badges */
  --ds-accent-soft-fg: #92400e;  /* amber-800 — text on soft */

  /* Semantic */
  --ds-success: #047857;
  --ds-success-soft: #ecfdf5;
  --ds-warn: #b45309;
  --ds-warn-soft: #fef3c7;
  --ds-danger: #b91c1c;
  --ds-danger-soft: #fee2e2;
  --ds-info: #1d4ed8;
  --ds-info-soft: #eff6ff;
}
```

- [ ] **Step 1.2 — Write `design-system/tokens/typography.css`:**

```css
:root {
  --ds-font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ds-font-mono: ui-monospace, SFMono-Regular, "SF Mono", monospace;

  /* Type scale (px) */
  --ds-text-xs: 0.75rem;    /* 12 */
  --ds-text-sm: 0.875rem;   /* 14 */
  --ds-text-base: 1rem;     /* 16 */
  --ds-text-lg: 1.125rem;   /* 18 */
  --ds-text-xl: 1.25rem;    /* 20 */
  --ds-text-2xl: 1.5rem;    /* 24 */
  --ds-text-3xl: 1.875rem;  /* 30 */
  --ds-text-4xl: 2.25rem;   /* 36 */

  /* Line-height */
  --ds-leading-tight: 1.2;
  --ds-leading-normal: 1.5;
  --ds-leading-relaxed: 1.7;

  /* Weight */
  --ds-weight-regular: 400;
  --ds-weight-medium: 500;
  --ds-weight-semibold: 600;
  --ds-weight-bold: 700;
}
```

- [ ] **Step 1.3 — Write `design-system/tokens/spacing.css`:**

```css
:root {
  /* 4px-base spacing scale */
  --ds-space-0: 0;
  --ds-space-1: 0.25rem;   /* 4 */
  --ds-space-2: 0.5rem;    /* 8 */
  --ds-space-3: 0.75rem;   /* 12 */
  --ds-space-4: 1rem;      /* 16 */
  --ds-space-6: 1.5rem;    /* 24 */
  --ds-space-8: 2rem;      /* 32 */
  --ds-space-12: 3rem;     /* 48 */
  --ds-space-16: 4rem;     /* 64 */
}
```

- [ ] **Step 1.4 — Write `design-system/tokens/radius.css`:**

```css
:root {
  --ds-radius-sm: 4px;
  --ds-radius-md: 6px;
  --ds-radius-lg: 10px;
  --ds-radius-full: 9999px;
}
```

- [ ] **Step 1.5 — Write `design-system/tokens/motion.css`:**

```css
:root {
  --ds-motion-fast: 120ms;
  --ds-motion-base: 200ms;
  --ds-motion-slow: 320ms;
  --ds-motion-ease: cubic-bezier(0.4, 0, 0.2, 1);
  --ds-motion-ease-out: cubic-bezier(0, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --ds-motion-fast: 0ms;
    --ds-motion-base: 0ms;
    --ds-motion-slow: 0ms;
  }
}
```

- [ ] **Step 1.6 — Write `design-system/tokens/index.css`:**

```css
@import "./colors.css";
@import "./typography.css";
@import "./spacing.css";
@import "./radius.css";
@import "./motion.css";
```

- [ ] **Step 1.7 — Verify CSS compiles.** Запусти `npm run build` или `npx tsc --noEmit && next build` локально. Ожидаем: 0 errors. Если ругается на `@import` — это нормально, мы подключим через app/globals.css на следующем шаге.

- [ ] **Step 1.8 — Import tokens в globals.css.** Edit `app/globals.css`, добавь первой строкой ПОСЛЕ `@tailwind utilities;`:

```css
@import "../design-system/tokens/index.css";
```

- [ ] **Step 1.9 — Verify tokens доступны.** Запусти `npm run dev`, открой любую страницу, в devtools проверь что у `:root` есть `--ds-bg: #f8fafc`. Ожидаем: значение видно.

- [ ] **Step 1.10 — Commit.**

```bash
git add design-system/tokens/ app/globals.css
git commit -m "feat(r1): add design-system tokens — Maritime Deep palette + typography/spacing/radius/motion"
```

---

## Task 2: Tailwind config extension

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 2.1 — Расширь `tailwind.config.ts`.** В блок `theme.extend.colors` ДОБАВЬ (не заменяй существующее, добавь рядом):

```ts
// в theme.extend.colors — добавить эти ключи РЯДОМ с существующими
ds: {
  bg: 'var(--ds-bg)',
  surface: 'var(--ds-surface)',
  'surface-muted': 'var(--ds-surface-muted)',
  border: 'var(--ds-border)',
  'border-strong': 'var(--ds-border-strong)',
  text: 'var(--ds-text)',
  'text-muted': 'var(--ds-text-muted)',
  'text-subtle': 'var(--ds-text-subtle)',
  accent: {
    DEFAULT: 'var(--ds-accent)',
    fg: 'var(--ds-accent-fg)',
    soft: 'var(--ds-accent-soft)',
    'soft-fg': 'var(--ds-accent-soft-fg)',
  },
  success: { DEFAULT: 'var(--ds-success)', soft: 'var(--ds-success-soft)' },
  warn: { DEFAULT: 'var(--ds-warn)', soft: 'var(--ds-warn-soft)' },
  danger: { DEFAULT: 'var(--ds-danger)', soft: 'var(--ds-danger-soft)' },
  info: { DEFAULT: 'var(--ds-info)', soft: 'var(--ds-info-soft)' },
},
```

И в `theme.extend` добавь:

```ts
borderRadius: {
  // существующие ключи оставь, добавь префиксированные
  'ds-sm': 'var(--ds-radius-sm)',
  'ds-md': 'var(--ds-radius-md)',
  'ds-lg': 'var(--ds-radius-lg)',
  'ds-full': 'var(--ds-radius-full)',
},
transitionDuration: {
  'ds-fast': 'var(--ds-motion-fast)',
  'ds-base': 'var(--ds-motion-base)',
  'ds-slow': 'var(--ds-motion-slow)',
},
```

> **Why `ds-` namespace?** Чтобы не конфликтовать с существующими токенами shadcn (`--background`, `--primary`, …). Старые компоненты используют `bg-background`, новые — `bg-ds-bg`. После R5 миграции старые удаляются.

- [ ] **Step 2.2 — Verify Tailwind подтягивает классы.** Запусти `npm run dev`, в любой component добавь `<div className="bg-ds-accent text-ds-accent-fg p-ds-md">test</div>` и убедись что фон navy, текст amber. Удали тестовую вставку.

- [ ] **Step 2.3 — Commit.**

```bash
git add tailwind.config.ts
git commit -m "feat(r1): extend tailwind config with ds-* semantic tokens"
```

---

## Task 3: Primitive utils

**Files:**
- Create: `design-system/primitives/_utils.ts`

- [ ] **Step 3.1 — Создай `_utils.ts` (re-export cn + cva).**

```ts
// design-system/primitives/_utils.ts
export { cn } from '@/lib/utils';
export { cva, type VariantProps } from 'class-variance-authority';
```

- [ ] **Step 3.2 — Verify `lib/utils.ts` экспортирует `cn`.** Запусти `grep -n 'export.*cn' lib/utils.ts`. Ожидаем: найдена строка `export function cn(…)` или `export { cn }`. Если нет — добавь:

```ts
// lib/utils.ts (если cn нет)
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 3.3 — Commit.**

```bash
git add design-system/primitives/_utils.ts lib/utils.ts
git commit -m "feat(r1): add primitive utils — cn + cva re-export"
```

---

## Tasks 4-19: 16 primitives (TDD per primitive)

**Pattern для каждого primitive:**

1. Write failing test in `design-system/__tests__/<Name>.test.tsx`
2. Run test, verify FAIL
3. Implement primitive in `design-system/primitives/<Name>.tsx`
4. Run test, verify PASS
5. Add to `design-system/primitives/index.ts` barrel
6. Commit `feat(r1): add <Name> primitive`

Ниже — конкретный код для каждого. Если subagent работает параллельно и какой-то primitive уже реализован — `git pull --rebase` перед коммитом.

---

### Task 4: Button primitive

**Files:**
- Create: `design-system/primitives/Button.tsx`
- Test: `design-system/__tests__/Button.test.tsx`

- [ ] **Step 4.1 — Write failing test:**

```tsx
// design-system/__tests__/Button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../primitives/Button';

describe('Button (design-system)', () => {
  it('renders children and fires onClick', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick} disabled>Save</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies variant=primary classes', () => {
    render(<Button variant="primary">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-ds-accent');
  });

  it('applies size=sm classes', () => {
    render(<Button size="sm">x</Button>);
    expect(screen.getByRole('button').className).toMatch(/text-xs|h-7/);
  });
});
```

- [ ] **Step 4.2 — Run test:** `npm test -- design-system/__tests__/Button.test.tsx`. Expected: FAIL (Button not defined).

- [ ] **Step 4.3 — Implement Button:**

```tsx
// design-system/primitives/Button.tsx
'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-ds-md ' +
    'transition-colors duration-ds-fast outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 ' +
    'disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-ds-accent text-ds-accent-fg hover:bg-ds-accent/90',
        secondary: 'bg-ds-surface text-ds-text border border-ds-border hover:bg-ds-surface-muted',
        ghost: 'bg-transparent text-ds-text hover:bg-ds-surface-muted',
        danger: 'bg-ds-danger-soft text-ds-danger border border-ds-danger/20 hover:bg-ds-danger/10',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-5 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = 'Button';
```

- [ ] **Step 4.4 — Run test:** `npm test -- design-system/__tests__/Button.test.tsx`. Expected: PASS (4 tests).

- [ ] **Step 4.5 — Создай `design-system/primitives/index.ts`:**

```ts
export * from './Button';
```

- [ ] **Step 4.6 — Commit.**

```bash
git add design-system/primitives/Button.tsx design-system/primitives/index.ts design-system/__tests__/Button.test.tsx
git commit -m "feat(r1): add Button primitive — variants primary/secondary/ghost/danger, sizes sm/md/lg"
```

---

### Task 5: Input primitive

**Files:**
- Create: `design-system/primitives/Input.tsx`
- Test: `design-system/__tests__/Input.test.tsx`

- [ ] **Step 5.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../primitives/Input';

describe('Input (design-system)', () => {
  it('renders and accepts typing', async () => {
    render(<Input placeholder="email" />);
    const el = screen.getByPlaceholderText('email');
    await userEvent.type(el, 'a@b.c');
    expect(el).toHaveValue('a@b.c');
  });

  it('forwards aria-invalid for error state', () => {
    render(<Input aria-invalid="true" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });
});
```

- [ ] **Step 5.2 — Run:** FAIL.

- [ ] **Step 5.3 — Implement:**

```tsx
// design-system/primitives/Input.tsx
'use client';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './_utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-ds-md border border-ds-border bg-ds-surface px-3 text-sm text-ds-text',
        'placeholder:text-ds-text-subtle',
        'outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 focus-visible:border-ds-accent',
        'disabled:opacity-50 disabled:pointer-events-none',
        'aria-[invalid=true]:border-ds-danger aria-[invalid=true]:ring-ds-danger/30',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
```

- [ ] **Step 5.4 — Run:** PASS.

- [ ] **Step 5.5 — Add to barrel `index.ts`:** добавь строку `export * from './Input';`

- [ ] **Step 5.6 — Commit.**

```bash
git add design-system/primitives/Input.tsx design-system/primitives/index.ts design-system/__tests__/Input.test.tsx
git commit -m "feat(r1): add Input primitive"
```

---

### Task 6: Textarea primitive

**Files:**
- Create: `design-system/primitives/Textarea.tsx`
- Test: `design-system/__tests__/Textarea.test.tsx`

- [ ] **Step 6.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from '../primitives/Textarea';

describe('Textarea (design-system)', () => {
  it('renders and accepts multiline', async () => {
    render(<Textarea placeholder="notes" />);
    const el = screen.getByPlaceholderText('notes');
    await userEvent.type(el, 'line 1{enter}line 2');
    expect(el).toHaveValue('line 1\nline 2');
  });
});
```

- [ ] **Step 6.2 — Run:** FAIL.

- [ ] **Step 6.3 — Implement:**

```tsx
// design-system/primitives/Textarea.tsx
'use client';
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from './_utils';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-ds-md border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text',
        'placeholder:text-ds-text-subtle',
        'outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 focus-visible:border-ds-accent',
        'disabled:opacity-50 disabled:pointer-events-none',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
```

- [ ] **Step 6.4 — Run:** PASS. Add to barrel. Commit `feat(r1): add Textarea primitive`.

---

### Task 7: Select primitive (base-ui)

**Files:**
- Create: `design-system/primitives/Select.tsx`
- Test: `design-system/__tests__/Select.test.tsx`

- [ ] **Step 7.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Select } from '../primitives/Select';

describe('Select (design-system)', () => {
  it('renders trigger with placeholder', () => {
    render(
      <Select.Root>
        <Select.Trigger placeholder="Choose port" />
        <Select.Content>
          <Select.Item value="cons">Constanta</Select.Item>
          <Select.Item value="alg">Algeciras</Select.Item>
        </Select.Content>
      </Select.Root>
    );
    expect(screen.getByText(/choose port/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.2 — Run:** FAIL.

- [ ] **Step 7.3 — Implement (wrap base-ui Select):**

```tsx
// design-system/primitives/Select.tsx
'use client';
import { Select as Base } from '@base-ui/react/select';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Root = Base.Root;

const Trigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Base.Trigger> & { placeholder?: string }
>(({ className, placeholder, ...props }, ref) => (
  <Base.Trigger
    ref={ref}
    className={cn(
      'inline-flex h-9 items-center justify-between gap-2 rounded-ds-md border border-ds-border bg-ds-surface px-3 text-sm text-ds-text',
      'outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40',
      'disabled:opacity-50',
      className
    )}
    {...props}
  >
    <Base.Value placeholder={placeholder} />
    <Base.Icon>▾</Base.Icon>
  </Base.Trigger>
));
Trigger.displayName = 'Select.Trigger';

const Content = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup>
>(({ className, ...props }, ref) => (
  <Base.Portal>
    <Base.Positioner sideOffset={4}>
      <Base.Popup
        ref={ref}
        className={cn(
          'min-w-[8rem] overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface shadow-lg p-1',
          className
        )}
        {...props}
      />
    </Base.Positioner>
  </Base.Portal>
));
Content.displayName = 'Select.Content';

const Item = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Item>
>(({ className, ...props }, ref) => (
  <Base.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center rounded-ds-sm px-2 py-1.5 text-sm text-ds-text',
      'hover:bg-ds-surface-muted data-[highlighted]:bg-ds-accent data-[highlighted]:text-ds-accent-fg',
      className
    )}
    {...props}
  />
));
Item.displayName = 'Select.Item';

export const Select = { Root, Trigger, Content, Item };
```

- [ ] **Step 7.4 — Run:** PASS. Add to barrel. Commit `feat(r1): add Select primitive (base-ui wrapper)`.

---

### Task 8: Badge primitive

**Files:**
- Create: `design-system/primitives/Badge.tsx`
- Test: `design-system/__tests__/Badge.test.tsx`

- [ ] **Step 8.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Badge } from '../primitives/Badge';

describe('Badge (design-system)', () => {
  it('renders text', () => {
    render(<Badge>94 match</Badge>);
    expect(screen.getByText('94 match')).toBeInTheDocument();
  });

  it('applies variant=success classes', () => {
    render(<Badge variant="success">ok</Badge>);
    expect(screen.getByText('ok')).toHaveClass('bg-ds-success-soft');
  });
});
```

- [ ] **Step 8.2 — Run:** FAIL.

- [ ] **Step 8.3 — Implement:**

```tsx
// design-system/primitives/Badge.tsx
import { type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const badgeVariants = cva(
  'inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-ds-sm border',
  {
    variants: {
      variant: {
        default: 'bg-ds-accent-soft text-ds-accent-soft-fg border-transparent',
        success: 'bg-ds-success-soft text-ds-success border-transparent',
        warn: 'bg-ds-warn-soft text-ds-warn border-transparent',
        danger: 'bg-ds-danger-soft text-ds-danger border-transparent',
        info: 'bg-ds-info-soft text-ds-info border-transparent',
        outline: 'bg-transparent text-ds-text-muted border-ds-border',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

- [ ] **Step 8.4 — Run:** PASS. Add to barrel. Commit `feat(r1): add Badge primitive`.

---

### Task 9: Pill primitive

**Files:**
- Create: `design-system/primitives/Pill.tsx`
- Test: `design-system/__tests__/Pill.test.tsx`

- [ ] **Step 9.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Pill } from '../primitives/Pill';

describe('Pill (design-system)', () => {
  it('renders fully-rounded with text', () => {
    render(<Pill>94</Pill>);
    expect(screen.getByText('94')).toHaveClass('rounded-ds-full');
  });
});
```

- [ ] **Step 9.2 — Run:** FAIL.

- [ ] **Step 9.3 — Implement:**

```tsx
// design-system/primitives/Pill.tsx
import { type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const pillVariants = cva(
  'inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-ds-full',
  {
    variants: {
      variant: {
        default: 'bg-ds-accent-soft text-ds-accent-soft-fg',
        success: 'bg-ds-success-soft text-ds-success',
        warn: 'bg-ds-warn-soft text-ds-warn',
        danger: 'bg-ds-danger-soft text-ds-danger',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface PillProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {}

export function Pill({ className, variant, ...props }: PillProps) {
  return <span className={cn(pillVariants({ variant }), className)} {...props} />;
}
```

- [ ] **Step 9.4 — Run:** PASS. Add to barrel. Commit `feat(r1): add Pill primitive`.

---

### Task 10: Card primitive

**Files:**
- Create: `design-system/primitives/Card.tsx`
- Test: `design-system/__tests__/Card.test.tsx`

- [ ] **Step 10.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Card } from '../primitives/Card';

describe('Card (design-system)', () => {
  it('renders children with surface bg', () => {
    render(<Card><div>content</div></Card>);
    const card = screen.getByText('content').parentElement!;
    expect(card).toHaveClass('bg-ds-surface');
  });
});
```

- [ ] **Step 10.2 — Run:** FAIL.

- [ ] **Step 10.3 — Implement:**

```tsx
// design-system/primitives/Card.tsx
import { forwardRef, type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const cardVariants = cva('bg-ds-surface border border-ds-border rounded-ds-md', {
  variants: {
    padding: { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' },
    interactive: { true: 'transition-colors duration-ds-fast hover:bg-ds-surface-muted cursor-pointer', false: '' },
  },
  defaultVariants: { padding: 'md', interactive: false },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ padding, interactive }), className)} {...props} />
  )
);
Card.displayName = 'Card';
```

- [ ] **Step 10.4 — Run:** PASS. Add to barrel. Commit `feat(r1): add Card primitive`.

---

### Task 11: Skeleton primitive

**Files:**
- Create: `design-system/primitives/Skeleton.tsx`
- Test: `design-system/__tests__/Skeleton.test.tsx`

- [ ] **Step 11.1 — Failing test:**

```tsx
import { render } from '@testing-library/react';
import { Skeleton } from '../primitives/Skeleton';

describe('Skeleton (design-system)', () => {
  it('renders with animate-pulse class', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });
});
```

- [ ] **Step 11.2 — Implement:**

```tsx
// design-system/primitives/Skeleton.tsx
import { type HTMLAttributes } from 'react';
import { cn } from './_utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-ds-sm bg-ds-surface-muted', className)}
      {...props}
    />
  );
}
```

- [ ] **Step 11.3 — Run PASS. Add to barrel. Commit `feat(r1): add Skeleton primitive`.**

---

### Task 12: Avatar primitive

**Files:**
- Create: `design-system/primitives/Avatar.tsx`
- Test: `design-system/__tests__/Avatar.test.tsx`

- [ ] **Step 12.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Avatar } from '../primitives/Avatar';

describe('Avatar (design-system)', () => {
  it('renders initials when no src', () => {
    render(<Avatar name="Boris Ivanov" />);
    expect(screen.getByText('BI')).toBeInTheDocument();
  });
});
```

- [ ] **Step 12.2 — Implement:**

```tsx
// design-system/primitives/Avatar.tsx
import { cn } from './_utils';

export interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

export function Avatar({ name = '', src, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-ds-full bg-ds-accent-soft text-ds-accent-soft-fg font-bold overflow-hidden',
        sizeMap[size],
        className
      )}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}
```

- [ ] **Step 12.3 — Run PASS. Add to barrel. Commit `feat(r1): add Avatar primitive`.**

---

### Task 13: Toast primitive (controlled, no provider)

**Files:**
- Create: `design-system/primitives/Toast.tsx`
- Test: `design-system/__tests__/Toast.test.tsx`

> **Note:** Toast — controlled component (open/onOpenChange), без global provider. Provider/stacking — отдельный pattern в R3.

- [ ] **Step 13.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Toast } from '../primitives/Toast';

describe('Toast (design-system)', () => {
  it('renders when open=true', () => {
    render(<Toast open>✨ Match saved</Toast>);
    expect(screen.getByRole('status')).toHaveTextContent('Match saved');
  });

  it('does not render when open=false', () => {
    render(<Toast open={false}>hidden</Toast>);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

- [ ] **Step 13.2 — Implement:**

```tsx
// design-system/primitives/Toast.tsx
import { type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const toastVariants = cva(
  'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 text-sm rounded-ds-md border shadow-lg',
  {
    variants: {
      variant: {
        default: 'bg-ds-surface text-ds-text border-ds-border',
        success: 'bg-ds-success-soft text-ds-success border-ds-success/20',
        danger: 'bg-ds-danger-soft text-ds-danger border-ds-danger/20',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface ToastProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  open: boolean;
}

export function Toast({ open, className, variant, children, ...props }: ToastProps) {
  if (!open) return null;
  return (
    <div role="status" aria-live="polite" className={cn(toastVariants({ variant }), className)} {...props}>
      {children}
    </div>
  );
}
```

- [ ] **Step 13.3 — Run PASS. Add to barrel. Commit `feat(r1): add Toast primitive`.**

---

### Task 14: Dialog primitive (base-ui)

**Files:**
- Create: `design-system/primitives/Dialog.tsx`
- Test: `design-system/__tests__/Dialog.test.tsx`

- [ ] **Step 14.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Dialog } from '../primitives/Dialog';

describe('Dialog (design-system)', () => {
  it('renders content when open', () => {
    render(
      <Dialog.Root open>
        <Dialog.Content>
          <Dialog.Title>Confirm</Dialog.Title>
          <Dialog.Description>Are you sure?</Dialog.Description>
        </Dialog.Content>
      </Dialog.Root>
    );
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });
});
```

- [ ] **Step 14.2 — Implement:**

```tsx
// design-system/primitives/Dialog.tsx
'use client';
import { Dialog as Base } from '@base-ui/react/dialog';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Root = Base.Root;
const Trigger = Base.Trigger;

const Content = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup>
>(({ className, children, ...props }, ref) => (
  <Base.Portal>
    <Base.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-ds-base" />
    <Base.Popup
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
        'rounded-ds-lg bg-ds-surface border border-ds-border shadow-xl p-6',
        className
      )}
      {...props}
    >
      {children}
    </Base.Popup>
  </Base.Portal>
));
Content.displayName = 'Dialog.Content';

const Title = forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof Base.Title>
>(({ className, ...props }, ref) => (
  <Base.Title ref={ref} className={cn('text-lg font-semibold text-ds-text mb-1', className)} {...props} />
));
Title.displayName = 'Dialog.Title';

const Description = forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof Base.Description>
>(({ className, ...props }, ref) => (
  <Base.Description ref={ref} className={cn('text-sm text-ds-text-muted mb-4', className)} {...props} />
));
Description.displayName = 'Dialog.Description';

export const Dialog = { Root, Trigger, Content, Title, Description };
```

- [ ] **Step 14.3 — Run PASS. Add to barrel. Commit `feat(r1): add Dialog primitive (base-ui wrapper)`.**

---

### Task 15: Sheet primitive (mobile bottom-sheet, base-ui Dialog reused)

**Files:**
- Create: `design-system/primitives/Sheet.tsx`
- Test: `design-system/__tests__/Sheet.test.tsx`

- [ ] **Step 15.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Sheet } from '../primitives/Sheet';

describe('Sheet (design-system)', () => {
  it('renders content when open', () => {
    render(
      <Sheet.Root open>
        <Sheet.Content>
          <div>sheet body</div>
        </Sheet.Content>
      </Sheet.Root>
    );
    expect(screen.getByText('sheet body')).toBeInTheDocument();
  });
});
```

- [ ] **Step 15.2 — Implement:**

```tsx
// design-system/primitives/Sheet.tsx
'use client';
import { Dialog as Base } from '@base-ui/react/dialog';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Root = Base.Root;
const Trigger = Base.Trigger;

const Content = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup>
>(({ className, ...props }, ref) => (
  <Base.Portal>
    <Base.Backdrop className="fixed inset-0 z-40 bg-black/40" />
    <Base.Popup
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto',
        'rounded-t-ds-lg bg-ds-surface border-t border-ds-border shadow-xl p-4',
        className
      )}
      {...props}
    />
  </Base.Portal>
));
Content.displayName = 'Sheet.Content';

export const Sheet = { Root, Trigger, Content };
```

- [ ] **Step 15.3 — Run PASS. Add to barrel. Commit `feat(r1): add Sheet primitive (mobile bottom-sheet)`.**

---

### Task 16: Tabs primitive (base-ui)

**Files:**
- Create: `design-system/primitives/Tabs.tsx`
- Test: `design-system/__tests__/Tabs.test.tsx`

- [ ] **Step 16.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from '../primitives/Tabs';

describe('Tabs (design-system)', () => {
  it('switches panels on tab click', async () => {
    render(
      <Tabs.Root defaultValue="a">
        <Tabs.List>
          <Tabs.Trigger value="a">A</Tabs.Trigger>
          <Tabs.Trigger value="b">B</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Panel value="a">panel A</Tabs.Panel>
        <Tabs.Panel value="b">panel B</Tabs.Panel>
      </Tabs.Root>
    );
    expect(screen.getByText('panel A')).toBeInTheDocument();
    await userEvent.click(screen.getByText('B'));
    expect(screen.getByText('panel B')).toBeInTheDocument();
  });
});
```

- [ ] **Step 16.2 — Implement:**

```tsx
// design-system/primitives/Tabs.tsx
'use client';
import { Tabs as Base } from '@base-ui/react/tabs';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Root = Base.Root;

const List = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.List>
>(({ className, ...props }, ref) => (
  <Base.List ref={ref} className={cn('flex gap-6 border-b border-ds-border', className)} {...props} />
));
List.displayName = 'Tabs.List';

const Trigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Base.Tab>
>(({ className, ...props }, ref) => (
  <Base.Tab
    ref={ref}
    className={cn(
      'py-2 text-sm text-ds-text-muted hover:text-ds-text border-b-2 border-transparent',
      'data-[selected]:text-ds-text data-[selected]:font-semibold data-[selected]:border-ds-accent-fg',
      className
    )}
    {...props}
  />
));
Trigger.displayName = 'Tabs.Trigger';

const Panel = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Panel>
>(({ className, ...props }, ref) => (
  <Base.Panel ref={ref} className={cn('pt-4', className)} {...props} />
));
Panel.displayName = 'Tabs.Panel';

export const Tabs = { Root, List, Trigger, Panel };
```

- [ ] **Step 16.3 — Run PASS. Add to barrel. Commit `feat(r1): add Tabs primitive`.**

---

### Task 17: Switch primitive (base-ui)

**Files:**
- Create: `design-system/primitives/Switch.tsx`
- Test: `design-system/__tests__/Switch.test.tsx`

- [ ] **Step 17.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from '../primitives/Switch';

describe('Switch (design-system)', () => {
  it('toggles checked state', async () => {
    const onChange = jest.fn();
    render(<Switch checked={false} onCheckedChange={onChange} aria-label="darkmode" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 17.2 — Implement:**

```tsx
// design-system/primitives/Switch.tsx
'use client';
import { Switch as Base } from '@base-ui/react/switch';
import { forwardRef } from 'react';
import { cn } from './_utils';

export type SwitchProps = React.ComponentPropsWithoutRef<typeof Base.Root>;

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, ...props }, ref) => (
    <Base.Root
      ref={ref}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-ds-full transition-colors duration-ds-fast',
        'bg-ds-border data-[checked]:bg-ds-accent',
        'outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40',
        className
      )}
      {...props}
    >
      <Base.Thumb className="h-4 w-4 translate-x-0.5 rounded-ds-full bg-ds-surface shadow transition-transform duration-ds-fast data-[checked]:translate-x-4" />
    </Base.Root>
  )
);
Switch.displayName = 'Switch';
```

- [ ] **Step 17.3 — Run PASS. Add to barrel. Commit `feat(r1): add Switch primitive`.**

---

### Task 18: Tooltip primitive (base-ui)

**Files:**
- Create: `design-system/primitives/Tooltip.tsx`
- Test: `design-system/__tests__/Tooltip.test.tsx`

- [ ] **Step 18.1 — Failing test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Tooltip } from '../primitives/Tooltip';

describe('Tooltip (design-system)', () => {
  it('renders trigger', () => {
    render(
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger>hover me</Tooltip.Trigger>
          <Tooltip.Content>tip text</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
    expect(screen.getByText('hover me')).toBeInTheDocument();
  });
});
```

- [ ] **Step 18.2 — Implement:**

```tsx
// design-system/primitives/Tooltip.tsx
'use client';
import { Tooltip as Base } from '@base-ui/react/tooltip';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Provider = Base.Provider;
const Root = Base.Root;
const Trigger = Base.Trigger;

const Content = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup>
>(({ className, ...props }, ref) => (
  <Base.Portal>
    <Base.Positioner sideOffset={6}>
      <Base.Popup
        ref={ref}
        className={cn(
          'z-50 rounded-ds-sm bg-ds-accent text-ds-accent-fg px-2 py-1 text-xs shadow-lg',
          className
        )}
        {...props}
      />
    </Base.Positioner>
  </Base.Portal>
));
Content.displayName = 'Tooltip.Content';

export const Tooltip = { Provider, Root, Trigger, Content };
```

- [ ] **Step 18.3 — Run PASS. Add to barrel. Commit `feat(r1): add Tooltip primitive`.**

---

### Task 19: Verify barrel export

**Files:**
- Modify: `design-system/primitives/index.ts`

- [ ] **Step 19.1 — Финальный `index.ts`:**

```ts
// design-system/primitives/index.ts
export * from './Button';
export * from './Input';
export * from './Textarea';
export * from './Select';
export * from './Badge';
export * from './Pill';
export * from './Card';
export * from './Skeleton';
export * from './Avatar';
export * from './Toast';
export * from './Dialog';
export * from './Sheet';
export * from './Tabs';
export * from './Switch';
export * from './Tooltip';
```

- [ ] **Step 19.2 — TS check.** Запусти `npx tsc --noEmit`. Ожидаем: 0 errors. Если есть — fix inline.

- [ ] **Step 19.3 — Run all primitive tests.** `npm test -- design-system/__tests__/`. Ожидаем: все 15 файлов с тестами зелёные.

- [ ] **Step 19.4 — Commit only if there were changes.**

```bash
git add design-system/primitives/index.ts
git diff --cached --quiet || git commit -m "feat(r1): finalize primitives barrel exports"
```

---

## Task 20: Preview page `/design` (внутренняя галерея)

**Files:**
- Create: `app/design/page.tsx`

- [ ] **Step 20.1 — Создай страницу.**

```tsx
// app/design/page.tsx
'use client';
import { useState } from 'react';
import {
  Button, Input, Textarea, Select, Badge, Pill, Card, Skeleton, Avatar,
  Toast, Dialog, Sheet, Tabs, Switch, Tooltip,
} from '@/design-system/primitives';

export default function DesignPage() {
  const [toastOpen, setToastOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [switchOn, setSwitchOn] = useState(false);

  return (
    <main className="min-h-screen bg-ds-bg text-ds-text p-6 space-y-8 font-sans">
      <header>
        <h1 className="text-3xl font-bold">Design System · R1 preview</h1>
        <p className="text-ds-text-muted text-sm mt-1">Maritime Deep palette · 15 primitives · internal page (не в nav)</p>
      </header>

      {/* Tokens — swatches */}
      <section aria-labelledby="t-tokens">
        <h2 id="t-tokens" className="text-xl font-semibold mb-3">Tokens · colors</h2>
        <div className="grid grid-cols-6 gap-3">
          {[
            ['bg', '--ds-bg'], ['surface', '--ds-surface'], ['border', '--ds-border'],
            ['text', '--ds-text'], ['text-muted', '--ds-text-muted'], ['text-subtle', '--ds-text-subtle'],
            ['accent', '--ds-accent'], ['accent-fg', '--ds-accent-fg'], ['accent-soft', '--ds-accent-soft'],
            ['success', '--ds-success'], ['warn', '--ds-warn'], ['danger', '--ds-danger'],
          ].map(([name, varName]) => (
            <div key={name} className="border border-ds-border rounded-ds-md p-3 bg-ds-surface">
              <div className="h-10 rounded-ds-sm border border-ds-border" style={{ background: `var(${varName})` }} />
              <div className="mt-2 text-xs font-semibold">{name}</div>
              <code className="text-[10px] text-ds-text-muted">{varName}</code>
            </div>
          ))}
        </div>
      </section>

      {/* Buttons */}
      <section aria-labelledby="t-buttons">
        <h2 id="t-buttons" className="text-xl font-semibold mb-3">Button</h2>
        <div className="flex gap-2 items-center flex-wrap">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      {/* Inputs */}
      <section aria-labelledby="t-form">
        <h2 id="t-form" className="text-xl font-semibold mb-3">Form</h2>
        <div className="grid grid-cols-3 gap-3 max-w-3xl">
          <Input placeholder="Email" />
          <Input placeholder="Disabled" disabled />
          <Input placeholder="Invalid" aria-invalid="true" />
          <Textarea placeholder="Notes…" />
          <Select.Root>
            <Select.Trigger placeholder="Choose port" />
            <Select.Content>
              <Select.Item value="cons">Constanta</Select.Item>
              <Select.Item value="alg">Algeciras</Select.Item>
              <Select.Item value="ven">Venice</Select.Item>
            </Select.Content>
          </Select.Root>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={switchOn} onCheckedChange={setSwitchOn} aria-label="Dark mode" />
            Dark mode (preview)
          </label>
        </div>
      </section>

      {/* Badges + Pills */}
      <section aria-labelledby="t-badge">
        <h2 id="t-badge" className="text-xl font-semibold mb-3">Badge & Pill</h2>
        <div className="flex gap-2 flex-wrap">
          <Badge>default</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warn">warn</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge variant="info">info</Badge>
          <Badge variant="outline">outline</Badge>
          <Pill>94</Pill>
          <Pill variant="success">match</Pill>
          <Pill variant="warn">pending</Pill>
          <Pill variant="danger">declined</Pill>
        </div>
      </section>

      {/* Cards */}
      <section aria-labelledby="t-card">
        <h2 id="t-card" className="text-xl font-semibold mb-3">Card</h2>
        <div className="grid grid-cols-3 gap-3 max-w-3xl">
          <Card><div className="text-sm font-semibold">Static card</div><div className="text-xs text-ds-text-muted mt-1">default padding md</div></Card>
          <Card interactive><div className="text-sm font-semibold">Interactive card</div><div className="text-xs text-ds-text-muted mt-1">hover state</div></Card>
          <Card padding="lg"><div className="text-sm font-semibold">Large padding</div></Card>
        </div>
      </section>

      {/* Skeleton */}
      <section aria-labelledby="t-skel">
        <h2 id="t-skel" className="text-xl font-semibold mb-3">Skeleton</h2>
        <div className="space-y-2 max-w-md">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      {/* Avatar */}
      <section aria-labelledby="t-avatar">
        <h2 id="t-avatar" className="text-xl font-semibold mb-3">Avatar</h2>
        <div className="flex gap-2 items-center">
          <Avatar name="Boris Ivanov" size="sm" />
          <Avatar name="Maria Schmidt" />
          <Avatar name="Petra Lang" size="lg" />
        </div>
      </section>

      {/* Tabs */}
      <section aria-labelledby="t-tabs">
        <h2 id="t-tabs" className="text-xl font-semibold mb-3">Tabs</h2>
        <Tabs.Root defaultValue="overview" className="max-w-xl">
          <Tabs.List>
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="economics">Economics</Tabs.Trigger>
            <Tabs.Trigger value="quote">Quote</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="overview"><div className="text-sm">Overview content</div></Tabs.Panel>
          <Tabs.Panel value="economics"><div className="text-sm">Economics content</div></Tabs.Panel>
          <Tabs.Panel value="quote"><div className="text-sm">Quote content</div></Tabs.Panel>
        </Tabs.Root>
      </section>

      {/* Overlays */}
      <section aria-labelledby="t-overlays">
        <h2 id="t-overlays" className="text-xl font-semibold mb-3">Overlays</h2>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setToastOpen(true)}>Show toast</Button>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button variant="ghost" onClick={() => setSheetOpen(true)}>Open sheet</Button>
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger asChild><Button variant="secondary">Hover tooltip</Button></Tooltip.Trigger>
              <Tooltip.Content>Tip text</Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>

        <Toast open={toastOpen} variant="success">✨ Match saved <button className="ml-2 underline" onClick={() => setToastOpen(false)}>close</button></Toast>

        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Content>
            <Dialog.Title>Confirm action</Dialog.Title>
            <Dialog.Description>Это превью dialog primitive.</Dialog.Description>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
            </div>
          </Dialog.Content>
        </Dialog.Root>

        <Sheet.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Sheet.Content>
            <h3 className="text-base font-semibold">Bottom sheet</h3>
            <p className="text-sm text-ds-text-muted mt-1">Mobile-style bottom sheet.</p>
            <Button className="mt-3" onClick={() => setSheetOpen(false)}>Close</Button>
          </Sheet.Content>
        </Sheet.Root>
      </section>
    </main>
  );
}
```

- [ ] **Step 20.2 — Verify rendering.** `npm run dev` → открой http://localhost:3000/design в браузере → проверь что все секции видны, кнопки кликабельны, dialog/sheet/toast открываются.

- [ ] **Step 20.3 — Commit.**

```bash
git add app/design/page.tsx
git commit -m "feat(r1): add /design preview page — internal gallery of all primitives + tokens"
```

---

## Task 21: Playwright visual regression на /design

**Files:**
- Create: `tests/visual/design-page.spec.ts`
- Modify (if not exists): `playwright.config.ts`

- [ ] **Step 21.1 — Проверь playwright config.** `cat playwright.config.ts 2>/dev/null || echo "missing"`. Если missing — создай:

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 21.2 — Создай visual spec:**

```ts
// tests/visual/design-page.spec.ts
import { test, expect } from '@playwright/test';

test.describe('/design — visual regression', () => {
  test('full page screenshot', async ({ page }) => {
    await page.goto('/design');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('design-full.png', { fullPage: true, maxDiffPixelRatio: 0.01 });
  });

  test('buttons section', async ({ page }) => {
    await page.goto('/design');
    const buttons = page.locator('section[aria-labelledby="t-buttons"]');
    await expect(buttons).toHaveScreenshot('buttons.png', { maxDiffPixelRatio: 0.01 });
  });

  test('tokens swatches', async ({ page }) => {
    await page.goto('/design');
    const tokens = page.locator('section[aria-labelledby="t-tokens"]');
    await expect(tokens).toHaveScreenshot('tokens.png', { maxDiffPixelRatio: 0.01 });
  });
});
```

- [ ] **Step 21.3 — Generate baseline:**

```bash
npx playwright install chromium  # если ещё не было
npx playwright test tests/visual/design-page.spec.ts --update-snapshots
```

Expected: 3 baseline PNG созданы в `tests/visual/design-page.spec.ts-snapshots/`.

- [ ] **Step 21.4 — Verify deterministic.** Запусти ещё раз без `--update-snapshots`:

```bash
npx playwright test tests/visual/design-page.spec.ts
```

Expected: 3 PASS.

- [ ] **Step 21.5 — Commit.**

```bash
git add tests/visual/design-page.spec.ts tests/visual/design-page.spec.ts-snapshots/ playwright.config.ts
git commit -m "test(r1): add visual regression for /design — full page + sections"
```

---

## Task 22: A11y test на /design

**Files:**
- Create: `tests/visual/design-page-a11y.spec.ts`

- [ ] **Step 22.1 — Создай axe spec:**

```ts
// tests/visual/design-page-a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('/design — 0 a11y violations', async ({ page }) => {
  await page.goto('/design');
  await page.waitForLoadState('networkidle');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
```

- [ ] **Step 22.2 — Запусти:**

```bash
npx playwright test tests/visual/design-page-a11y.spec.ts
```

Expected: PASS (0 violations). Если есть violations — fix в соответствующем primitive (обычно missing aria-label/role или low contrast), пересмотри Maritime Deep tokens.

- [ ] **Step 22.3 — Commit.**

```bash
git add tests/visual/design-page-a11y.spec.ts
git commit -m "test(r1): add axe a11y check on /design"
```

---

## Task 23: README guidelines

**Files:**
- Create: `design-system/README.md`

- [ ] **Step 23.1 — Напиши README:**

```markdown
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

## Tests

```bash
npm test -- design-system          # unit tests (jest)
npx playwright test tests/visual   # visual regression + a11y
```

Visual baseline хранится в `tests/visual/design-page.spec.ts-snapshots/`. Обновлять
через `--update-snapshots` только когда design правда изменился, не для починки flaky
tests.
```

- [ ] **Step 23.2 — Commit.**

```bash
git add design-system/README.md
git commit -m "docs(r1): add design-system README — usage, palette, coexistence rules"
```

---

## Task 24: Final verification + open PR

- [ ] **Step 24.1 — TS strict check.**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 24.2 — Jest full run.**

```bash
npm test -- design-system
```

Expected: ALL tests pass (15 test files, ~20-30 tests суммарно).

- [ ] **Step 24.3 — Visual + a11y full.**

```bash
npx playwright test tests/visual
```

Expected: 4 PASS (3 visual + 1 a11y).

- [ ] **Step 24.4 — Regression smoke на main pages.** Запусти `npm run dev` и быстро открой:
  - http://localhost:3000/ (landing)
  - http://localhost:3000/matches
  - http://localhost:3000/dashboard
  - http://localhost:3000/market

Expected: всё открывается, выглядит как раньше (R1 ничего не должен сломать).

- [ ] **Step 24.5 — Final commit + push.**

```bash
git push -u origin design/full-redesign-spec-r1
```

- [ ] **Step 24.6 — Open PR.**

```bash
gh pr create \
  --title "R1: Design-system foundation (Maritime Deep + 15 primitives + /design preview)" \
  --body "$(cat <<'EOF'
## R1 — Design-system foundation

Реализует первый из 6 sub-projects из [redesign spec](../docs/superpowers/specs/2026-05-24-quantika-demo-full-redesign-design.md).

### Что добавилось
- `design-system/tokens/` — Maritime Deep палитра (navy + amber) + typography/spacing/radius/motion
- `design-system/primitives/` — 15 primitives: Button, Input, Textarea, Select, Badge, Pill, Card, Skeleton, Avatar, Toast, Dialog, Sheet, Tabs, Switch, Tooltip
- `app/design/` — internal preview-страница (не в nav)
- `tests/visual/` — Playwright visual regression + axe a11y
- `tailwind.config.ts` — расширен `ds.*` semantic colors (parallel к существующим)

### Что НЕ изменилось
- Существующие страницы — не трогаем
- `components/ui/*` (shadcn) — остаётся, удалится в R5 после миграции последней страницы
- Backend API — без изменений

### Verification
- ✅ TS strict, 0 errors
- ✅ Jest tests pass (15 primitive specs)
- ✅ Playwright visual baseline + 0 axe violations on /design
- ✅ Smoke check main pages unchanged

### Next
R2 (AppShell + ModeSwitcher) использует эти primitives для layout.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
  --base main
```

- [ ] **Step 24.7 — Запусти `/test-skill` (cold-session adversarial QA).** В отдельной сессии: `/test-skill design/full-redesign-spec-r1`. Severity gate: PASS = 0 CRIT + 0 HIGH. Если PASS — auto-merge через `gh pr merge <N> --squash --admin --auto` (pre-authorized для design-only PR).

---

## Success criteria для R1

- ✅ `/design` страница показывает все primitives + tokens, axe 0 violations
- ✅ `tailwind.config.ts` расширен `ds.*` semantic токенами; `design-system/tokens/*.css` импортируются через globals
- ✅ TypeScript strict, 0 errors
- ✅ Playwright visual snapshots на `/design` — 3 baseline saved + 0 a11y violations
- ✅ `design-system/README.md` объясняет: usage, when-primitive-vs-pattern, palette usage rules, coexistence
- ✅ Существующие страницы продолжают работать без изменений (smoke check pass)
- ✅ Branch `design/full-redesign-spec-r1` merged в `main` через PR + auto-deploy успешен

---

## Out of scope (для R1)

- ❌ Dark mode (готовим token-слой, реализация в R6)
- ❌ Миграция страниц на новые primitives (R2-R5)
- ❌ Patterns (LiveStrip, AIBar, ModeSwitcher) — R2-R4
- ❌ Удаление `components/ui/*` (последний шаг R5)
- ❌ Бизнес-логика любая
- ❌ Storybook/Histoire — `/design` страница вместо

---

## Risks & gotchas

| Risk | Mitigation |
|---|---|
| Playwright baseline нестабилен в CI vs local (fonts, антиалиасинг) | `maxDiffPixelRatio: 0.01` (1% tolerance); если флаки — bump до 0.02, не баловаться с тенями |
| `@base-ui/react` API изменился между minor-версиями | Lock `@base-ui/react@^1.4.1` в package.json, не bump'ить в R1 |
| `--ds-*` токены конфликтнут с shadcn `--background` etc. | Префикс `ds-` гарантирует изоляцию; ни один существующий компонент не использует `bg-ds-*` |
| TS strict ругается на `React.ComponentPropsWithoutRef` от base-ui | Если base-ui не экспортирует тип — `type X = Parameters<typeof Base.X>[0]` |
| `npm test` падает на parallel из-за shared toast/dialog state | Каждый test файл self-contained; не нужен setupFile |

---

## Self-review checklist (для author plan'а)

- ✅ Каждый primitive имеет TDD-task (test → fail → impl → pass → commit)
- ✅ Все 15 primitives упомянуты в barrel index (Task 19)
- ✅ Tokens определены ДО primitives (Task 1 → Tasks 4-18)
- ✅ Tailwind config extended ДО primitives (Task 2 → Tasks 4-18)
- ✅ Visual+a11y tests ПОСЛЕ preview page (Tasks 21-22 → Task 20)
- ✅ Каждый файл-action имеет полный код, не «similar to»
- ✅ Никаких TBD / TODO / «handle edge cases»
- ✅ Все file paths абсолютные относительно repo root
- ✅ Финальный PR-body содержит verification checklist
