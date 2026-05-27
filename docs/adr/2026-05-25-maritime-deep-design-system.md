# ADR: Maritime Deep Design System

**Date:** 2026-05-25
**Status:** Accepted
**Deciders:** Vitali, Engineering Team
**Related:** [Full Redesign Spec](../superpowers/specs/2026-05-24-quantika-demo-full-redesign-design.md), [Design System Overview](../design-system.md), [ROADMAP §"Full Redesign R1-R6"](../ROADMAP-CURRENT-STATE.md)
**Drafted by:** doc-keeper sync (Consequences pending human review)

---

## Context

The UI grew organically from a demo into a production-grade broker tool, accumulating
inconsistencies the 2026-05-19 UI audit captured (audit §1.4): feature pages (laytime,
market, PSC) were desktop-first with no `sm:` fallback, there was no persistent bottom
navigation, touch targets were below the 44px minimum, and primitives were a mix of
shadcn/radix components in `components/ui/` with no shared token layer. Dark mode, RTL,
and accessibility (WCAG AA) had no foundation to build on.

A pilot with a real freight broker is the near-term goal, and the broker-trust strategy
requires the interface to look and behave like a coherent, accessible product rather than
a stitched-together demo.

## Decision

Adopt **Maritime Deep** as the canonical design system, living in the `design-system/`
directory, and migrate the entire app onto it (redesign waves R1–R6, completed 2026-05-25):

- **Token layer** — Tailwind CSS with a CSS-variable token namespace (`--ds-*` / `ds.`
  prefix) for colors, radius, and motion. Brand accent is amber `#f59e0b`. Dark-mode
  tokens are drafted under `[data-theme="dark"]` but the toggle is deferred to R6.5.
- **15 RSC-compatible primitives** in `design-system/primitives/` (Button, Badge, Card,
  Input, Select, Dialog, Sheet, Tooltip, Tabs, Switch, Textarea, Toast, Skeleton, Avatar,
  Pill) — no client-only hooks, App Router friendly.
- **App-shell patterns** in `design-system/patterns/` — AppShell, TopNav, BottomNav,
  ModeSwitcher (charterer↔owner), AIBar + ⌘K command palette + HelpFAB, LiveStrip +
  SSE job stream + MatchToast.
- **All 22 pages migrated** to the new system; a `/design` preview page documents primitives.
- **Accessibility gate** — Playwright + axe specs across 23 pages (WCAG 2.1 AA) plus a
  Lighthouse CI gate (perf ≥ 0.85, a11y ≥ 0.95).
- The legacy shadcn/radix primitives in `components/ui/` are **superseded** but not yet
  deleted — still imported by 22 files; removal is tracked as follow-up Q002 (R6.5).

## Consequences

_Drafted by doc-keeper — to be reviewed and completed by a human._

- _(easier)_ Consistent, accessible, branded UI across all pages; a single token layer to
  re-theme (e.g. activating dark mode) instead of per-page edits.
- _(harder / cost)_ Two primitive libraries coexist until Q002 finishes the `components/ui/`
  migration (40 imports across 22 files) — risk of drift and double-maintenance in the interim.
- _(open)_ Dark-mode toggle, Lighthouse CI wiring in GitHub Actions (`@lhci/cli` install),
  and the legacy-dir deletion remain as R6.5 follow-ups.
- _Human to confirm:_ alternatives ruled out (e.g. staying on shadcn + a token wrapper) and
  the long-term maintenance owner of `design-system/`.
