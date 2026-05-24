# Quantika Design System — Maritime Deep

> Overview for new developers. Full specs: `docs/superpowers/specs/2026-05-24-quantika-demo-full-redesign-design.md`

## Stack

- **Tailwind CSS** with CSS-variable token layer (`--ds-*`)
- **Next.js App Router** — all design-system components are RSC-compatible (no client-only hooks)
- **Source:** `design-system/` directory

## Token Namespace

All design tokens live under the `ds.` prefix in Tailwind and `--ds-*` in CSS variables.

### Colors

```
ds-bg             Page background
ds-surface        Card / panel surface
ds-surface-muted  Subdued surface (sidebar, table stripe)
ds-border         Default border
ds-border-strong  High-emphasis border (active, focused)
ds-text           Primary text
ds-text-muted     Secondary text
ds-text-subtle    Placeholder / hint text

ds-accent         Brand amber (#f59e0b) — CTAs, active states
ds-accent-fg      Text on accent background
ds-accent-soft    Low-emphasis accent tint
ds-success / ds-success-soft
ds-warn   / ds-warn-soft
ds-danger / ds-danger-soft
ds-info   / ds-info-soft
```

### Border Radius

```
rounded-ds-sm    4px
rounded-ds-md    8px    (default cards, buttons)
rounded-ds-lg    12px   (modals, sheets)
rounded-ds-full  9999px (pills, badges)
```

### Motion

```
duration-ds-fast   100ms  (micro-interactions)
duration-ds-base   200ms  (default transitions)
duration-ds-slow   400ms  (page enter/exit)
```

## Component Directory

| Path | What's in it |
|------|-------------|
| `design-system/primitives/` | Button, Badge, Card, Input, Select, Dialog, Sheet, Tooltip, Tabs, Switch, Textarea, Toast, Skeleton, Avatar, Pill |
| `design-system/patterns/` | AppShell, TopNav, BottomNav, ModeSwitcher, AIBar, CmdKPalette, HelpFAB, LiveStrip, MatchToast, ModeProvider |
| `design-system/tokens/` | CSS token files |
| `design-system/__tests__/` | Pattern-level unit tests |

## Usage Patterns

### Button

```tsx
import { Button } from '@/design-system/primitives/Button';
<Button variant="primary">Save</Button>
<Button variant="ghost" size="sm">Cancel</Button>
```

Variants: `primary` | `secondary` | `ghost` | `danger`
Sizes: `sm` | `md` (default) | `lg`

### Badge

```tsx
import { Badge } from '@/design-system/primitives/Badge';
<Badge variant="success">Active</Badge>
<Badge variant="warn">Pending</Badge>
```

Variants: `default` | `success` | `warn` | `danger` | `info`

### Dark Mode

Tokens are drafted under `[data-theme="dark"]` in `design-system/tokens/colors.css`.
The toggle is **not active yet** (R6.5). Set `data-theme="dark"` on `<html>` to preview.

## Legacy Components

`components/ui/` contains the original shadcn/radix primitives (Button, Badge, Card, Progress, PageSkeleton).
These are still imported by 22 files. **Do not delete until all imports are migrated.**
Migration tracked in `QUESTIONS.md` Q002.
