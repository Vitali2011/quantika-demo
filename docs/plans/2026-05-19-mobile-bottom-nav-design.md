# Mobile Bottom Nav — Design Doc

**Date:** 2026-05-19  
**Branch:** `design/mobile-bottom-nav-t2a`  
**Status:** DESIGN ONLY — Phase 2 implementation pending orchestrator approval  
**Scope:** P1.5 from ROADMAP §1.4 — mobile-first for sales-pitch iPhone demos

---

## 1. Current State Analysis

### What exists

| Component | File | Mobile-ready? | Notes |
|-----------|------|---------------|-------|
| `BottomSheet` | `components/mobile/BottomSheet.tsx` | ✅ | Snap points 30/60/95%, focus trap, Escape, swipe-to-close |
| `SwipeCard` | `components/mobile/SwipeCard.tsx` | ✅ | Horizontal swipe with haptics, ref-based for sync events |
| `FabVoice` | `components/mobile/FabVoice.tsx` | ✅ | Fixed `bottom: 24, right: 24`, `zIndex: 40` — **conflicts with bottom nav** |

### What's missing

- **No top-level navigation** anywhere. `app/layout.tsx` renders only `<TrialBanner>` and `{children}`. Every page is a standalone island — no shared nav header, no sidebar, no bottom bar.
- **No back-navigation pattern** on feature pages (`/laytime`, `/market`, `/psc`). Users must use the browser back button.
- **No bottom nav bar** (confirmed absent).

### Routes inventory

Primary routes discovered in `app/`:

| Route | Purpose | Auth required | Feature-flagged? |
|-------|---------|---------------|-----------------|
| `/` | Landing / onboarding | No | No |
| `/dashboard` | Operational home (emails, matches, priorities) | Yes | No |
| `/matches` | Cargo-vessel match list with filters + bulk actions | Yes | No |
| `/market` | BHSI / TMI / Drewry benchmark charts | Yes | `NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED` |
| `/laytime` | Laytime calculator | Yes | `NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED` |
| `/charterers` | Charterer credit profiles | Yes | `NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED` |
| `/psc` | Port state control history | Yes | No |
| `/vessels` | Vessel roster | Yes | No |
| `/upgrade` | Upgrade / pricing | No | No |
| `/summary` | Session summary + impact | Yes | No |
| `/cargo/[id]`, `/email/[id]`, `/match/[id]`, `/fixture/[id]`, `/vessel/[id]` | Detail pages | Yes | No |

### Touch target audit

`grep -rn 'h-8\|h-9' components/ui/` reveals:

```
components/ui/button.tsx:26  h-8 (default size = 32px)   ← FAILS 44px minimum
components/ui/button.tsx:29  h-9 (lg size = 36px)        ← FAILS 44px minimum
components/ui/button.tsx:30  icon: size-8 (32px)         ← FAILS
components/ui/button.tsx:35  icon-lg: size-9 (36px)      ← FAILS
```

All four Button size variants fall below the 44px touch target minimum. The `Button` component is used app-wide. No app-level pages use these Button sizes directly (checked `app/` grep), but the UI library sizes are inherited by any page using `<Button>`.

---

## 2. Design Options

### Option A — Fixed bottom nav, mobile-only (`md:hidden`)

A 4-tab bar rendered in `app/layout.tsx`, visible only on `< 768px`. The existing desktop experience is unchanged.

```
┌─────────────────────────────┐
│          Page content       │
│                             │
│                             │
├─────────────────────────────┤  ← bottom nav (56px, `md:hidden`)
│  🏠 Home  📦 Matches  📈 Market  ☰ More  │
└─────────────────────────────┘
```

**Pros:**
- Zero blast radius on desktop — existing layout unchanged
- Low implementation risk: add one Server Component in layout.tsx, render it conditionally
- Easy to iterate: just edit one file
- Path-safe: no refactor of existing pages

**Cons:**
- FabVoice (`bottom: 24`) will sit behind the nav bar — requires offset fix (`bottom-[80px]` or CSS env `safe-area-inset-bottom`)
- Feature-flagged routes (Market, Laytime) need conditional rendering of tabs
- "More" tab needs a sheet or page for secondary routes

---

### Option B — Bottom nav replaces top nav on all viewports

A unified bottom bar that is the sole navigation on mobile and replaces or complements a (future) top nav on desktop.

```
Mobile:                          Desktop:
┌──────────────────────┐        ┌──────────────────────────────────────┐
│       content        │        │  [Quantika] Home  Matches  Market    │
│                      │        │                   [content]          │
├──────────────────────┤        └──────────────────────────────────────┘
│ 🏠  📦  📈  ☰       │
└──────────────────────┘
```

**Pros:**
- Single source of truth for routing
- Would enable a unified header with brand + user on desktop

**Cons:**
- Currently there is no top nav at all — this is a larger design change requiring new desktop nav too
- Significantly higher scope; risk of regression across all pages
- Premature: the demo has no desktop top nav today, so adding one alongside a bottom bar doubles the scope
- Not the right trade-off for a focused P1.5 deliverable

---

### Option C — Hamburger menu + bottom nav hybrid

A bottom bar with 3-4 primary tabs plus a hamburger/menu button that opens a `BottomSheet` with secondary routes.

```
┌─────────────────────────────┐
│          Page content       │
├─────────────────────────────┤
│  🏠 Home  📦 Matches  ≡ Menu │
└─────────────────────────────┘
         ↕ BottomSheet opens
         with: Market, Laytime,
               Charterers, Settings
```

**Pros:**
- Leverages existing `BottomSheet` component
- Keeps primary bar minimal (3 tabs = more breathing room for labels)
- Secondary routes hidden until needed — cleaner for sales pitch

**Cons:**
- Two-level navigation (tab + sheet) adds interaction complexity
- `BottomSheet` was designed for content, not nav — `role="dialog"` is semantically wrong for persistent nav; would require ARIA adjustment
- Slightly harder to discover secondary routes during a pitch demo

---

## 3. Recommended Option

**Option A — Fixed bottom nav, mobile-only.**

Reasoning:

1. **Blast radius is minimal.** Adding `md:hidden` to a layout component does not touch desktop rendering at all. Existing pages need zero changes.
2. **Matches the immediate goal.** The ROADMAP audit cites "desktop-first, no `sm:` fallback" and "bottom nav absent". Option A fixes both with the smallest surface area.
3. **FabVoice conflict is solvable** with a CSS variable or utility class change in one file (`FabVoice.tsx`). Not a blocker.
4. **Feature-flagged tabs** can be hidden at render time via `process.env.*` checks in a Server Component — no client-side overhead.
5. **Sales pitch scenario**: showing a clean 4-tab bar on an iPhone is immediately compelling. Option B/C are refinements, not requirements for the pitch.

---

## 4. Tabs / Routes Proposal

4-tab layout for Option A:

| Position | Label | Icon (Lucide) | Route | Notes |
|----------|-------|---------------|-------|-------|
| 1 | Home | `Home` | `/dashboard` | Default landing for authenticated users |
| 2 | Matches | `Layers` or `GitMerge` | `/matches` | Core monetizable feature |
| 3 | Market | `TrendingUp` | `/market` | Hide tab if `NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED !== 'true'` |
| 4 | More | `Menu` | — | Opens inline BottomSheet with secondary links |

**"More" sheet contents:**
- Laytime (`/laytime`) — if `NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED`
- Charterers (`/charterers`) — if `NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED`
- PSC (`/psc`)
- Vessels (`/vessels`)
- Upgrade (`/upgrade`)
- Summary (`/summary`)

**Why not `/` (landing) as Home tab?** The landing page is an onboarding/pre-auth view; it redirects to `/dashboard` once authenticated. Making `/dashboard` the Home tab avoids a confusing redirect.

**Why not `/charterers` or `/vessels` in primary tabs?** These are secondary features used during deal research, not the primary daily workflow. They belong in the "More" overflow.

### Active tab detection

Use `usePathname()` from `next/navigation` to mark the active tab. For detail routes (e.g. `/match/[id]`), the active tab should be the parent route (`/matches`). Map:

```
/dashboard, /cargo/*, /email/*, /fixture/*  → Home active
/matches, /match/*                           → Matches active
/market                                      → Market active
*                                            → More active (soft highlight)
```

---

## 5. Touch Targets — Implementation Plan

### Problem

`components/ui/button.tsx` defines sizes all below 44px:
- `default`: `h-8` = 32px
- `lg`: `h-9` = 36px  
- `icon`: `size-8` = 32px
- `icon-lg`: `size-9` = 36px

### Fix strategy (Phase 2)

**Do NOT change existing button sizes globally.** Changing `default` from `h-8` to `h-11` (44px) would visually break every form and action button in the app. The correct approach:

1. **Add a `touch` size variant** to `buttonVariants` in `button.tsx`:
   ```
   touch: "h-11 gap-1.5 px-3"          // 44px, for bottom nav and mobile CTAs
   icon-touch: "size-11"                // 44px icon-only, for FABs
   ```

2. **Use `touch` size in BottomNav items** — each tab button gets `size="touch"` or equivalent.

3. **Audit high-traffic mobile paths** for small buttons and apply `size="touch"` where user intent requires a tap target. Priority pages:
   - `/dashboard` (Action Panel CTAs)
   - `/matches` (status filter buttons, bulk action buttons)
   - `/cargo/[id]` (reply / quote buttons)

4. **Do not bulk-upgrade all sizes** — most small buttons (filters, inline chips) are intentional density choices. Only update actionable primary CTAs on mobile-critical paths.

### CSS safe area

Bottom nav must respect iOS home indicator:
```css
padding-bottom: env(safe-area-inset-bottom, 0px);
```

Apply in the bottom nav wrapper, not via `pb-safe` Tailwind (not in default config; requires plugin or arbitrary value `pb-[env(safe-area-inset-bottom)]`).

---

## 6. A11y Considerations

### ARIA structure

```html
<nav aria-label="Main navigation">
  <a href="/dashboard" aria-current="page">  ← aria-current on active tab
    <Home aria-hidden="true" />
    <span>Home</span>
  </a>
  ...
</nav>
```

- Use `<nav>` landmark with `aria-label="Main navigation"`.
- Each tab is an `<a>` (or `next/link`), not a `<button>` — screen readers announce it as a link.
- Active tab: `aria-current="page"` (not `aria-selected`, which belongs on tab panels).
- Icons: `aria-hidden="true"` on SVGs; label text always visible (don't hide labels on mobile — they help during demo).

### Focus states

- All tab items must have visible `focus-visible` ring (`focus-visible:ring-2 focus-visible:ring-offset-2`). The existing `button.tsx` CVA config has `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` — port this pattern to nav links.

### Keyboard navigation

- Tab bar should be keyboard-traversable (Tab key moves between items).
- `←` / `→` arrow key navigation within the nav bar is a nice-to-have (ARIA tab-panel pattern), but not required for `role="navigation"` — standard tab/focus flow is sufficient.

### Screen reader announcement

- When navigating to a new route, Next.js App Router handles focus reset; no custom `aria-live` needed for route changes.
- The "More" BottomSheet overlay must use the existing `BottomSheet` component's `role="dialog"` + `aria-modal="true"` + focus trap — already implemented.

### Color contrast

- Active tab indicator must have ≥ 3:1 contrast ratio against the nav background (WCAG AA non-text). A solid colored icon + underline or dot indicator is safer than color-only differentiation.

---

## 7. FabVoice Conflict

`FabVoice` is positioned `position: fixed; bottom: 24px; right: 24px`. With a bottom nav bar of ~56px + safe area, FabVoice will render behind the nav bar.

**Fix (Phase 2):** Change FabVoice to use a CSS custom property:

```tsx
style={{ bottom: 'calc(var(--bottom-nav-height, 0px) + 24px)', right: 24, zIndex: 40 }}
```

Set `--bottom-nav-height: 56px` on `<body>` (or a layout wrapper) when the bottom nav is mounted. On desktop (where nav is `md:hidden`), the variable stays `0px` → no change.

Alternatively, pass a `bottomOffset` prop to `FabVoice`. The CSS variable approach is preferred as it avoids prop drilling through every consumer.

---

## 8. Implementation Plan (Phase 2 — not in scope today)

### Files to create

| File | Purpose |
|------|---------|
| `components/nav/BottomNav.tsx` | Mobile bottom nav component (Server Component wrapping client `usePathname`) |
| `components/nav/MoreSheet.tsx` | BottomSheet with secondary nav links |
| `components/nav/index.ts` | Barrel export |

### Files to modify

| File | Change |
|------|--------|
| `app/layout.tsx` | Import and render `<BottomNav />` inside `<body>`, after `{children}` |
| `components/mobile/FabVoice.tsx` | Add `--bottom-nav-height` CSS variable consumption (see §7) |
| `components/ui/button.tsx` | Add `touch` and `icon-touch` size variants |
| `app/globals.css` | Set `--bottom-nav-height: 56px` on `body` when nav is visible (or via JS on mount) |

### Test plan

1. **Unit**: `BottomNav` renders correct `aria-current` for each route (mock `usePathname`).
2. **Unit**: `MoreSheet` — feature-flagged routes only appear when env vars set.
3. **E2E (Playwright)**: on mobile viewport (375×812), tab bar visible; on desktop (1280×800), tab bar hidden.
4. **A11y**: `axe-core` scan on `/dashboard` at mobile viewport — zero violations on `nav` landmark.
5. **Visual regression**: snapshot `/dashboard` at 375px — tab bar renders at bottom with correct safe area padding.

### Estimated effort

| Task | Estimate |
|------|----------|
| `BottomNav.tsx` + `MoreSheet.tsx` | 2–3h |
| `app/layout.tsx` integration | 30min |
| `FabVoice` offset fix | 30min |
| `button.tsx` `touch` variant | 30min |
| Tests (unit + E2E) | 2h |
| **Total** | **5.5–6.5h** |

### Flags / escalation

- No feature flag needed — `md:hidden` is the gate. Desktop users never see it.
- `MoreSheet` secondary links should still check their respective feature flags before rendering to avoid dead-end navigation.
- If `app/layout.tsx` needs to become a Client Component to support `usePathname` for active-tab detection, consider keeping layout as a Server Component and wrapping only `BottomNav` in `'use client'` — this is the correct RSC boundary pattern.
- **No major refactor required.** `app/layout.tsx` (50 lines) does not need restructuring — append one component render.

---

## 9. Open Questions for Phase 2

1. Should Market tab be hidden when `NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED !== 'true'`, or shown with a "coming soon" state? (Hiding is simpler and cleaner for pitch demos.)
2. Does FabVoice need to coexist with bottom nav on all authenticated routes, or only on `/dashboard`? If only `/dashboard`, the CSS variable approach is simpler.
3. Should the bottom nav render on the landing page (`/`) and onboarding flow, or only on authenticated routes? Recommendation: show only when `session_id` cookie is present (same gate as `TrialBannerWrapper`).
