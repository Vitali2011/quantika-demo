# React #418 reproduction report (γ-cleanup-E)

## Setup
- Browser: Chrome (Vitali macOS), navigator.language = ru-RU, navigator.languages = ru-RU, ru, en-US, en
- demo.quantika.org API health: version 0.1.0, commit a46d4d2 (origin/main)
- Date/time of repro: 2026-05-04 ~18:17 UTC+2

## Trajectory

1. **https://demo.quantika.org/** → click "Try with Sample Data" → `/processing` (50%→63%, waiting ~90s)
2. **Auto-redirect → `/dashboard`** — console: no #418 yet (tracking started mid-load)
3. **`/dashboard` → click cargo card** → `/cargo/sample-09` — no errors
4. **`/cargo/sample-09` → click email link** → `/email/sample-09#highlight` — **#418 FIRES** (first confirmed capture)
5. **`navigate()` back to `/dashboard`** (fresh page load via `navigate` tool) — **#418 FIRES AGAIN** (confirming dashboard hydration is broken independently)
6. **SPA navigation `/dashboard` → `/match/14` → back to `/dashboard`** — no additional errors beyond initial hydration

## Repro: YES

Error confirmed reproducible on two separate page loads.

## Console errors captured

```
[18:17:13] [EXCEPTION]
Error: Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]= for the full message
    at rX (https://demo.quantika.org/_next/static/chunks/0_hinvcpv2llj.js:1:47212)
    at <anonymous> (0_hinvcpv2llj.js:1:144189)
    at sh (0_hinvcpv2llj.js:1:147754)
    at sd (0_hinvcpv2llj.js:1:139004)
    at <anonymous> (0_hinvcpv2llj.js:1:133829)
    at se (0_hinvcpv2llj.js:1:133930)
    at s$ (0_hinvcpv2llj.js:1:160494)
    at O (0_hinvcpv2llj.js:1:8659)

[18:18:04] [EXCEPTION] — same error on second /dashboard load via navigate()
```

URL args: `args[]=text&args[]=` → decoded React message: "Text content did not match. Server: %s Client: %s" with server="text" client="" — meaning React found a text node on server but empty/missing on client, or vice versa.

## Hypothesis: root cause

**Primary cause: `toLocaleString(undefined, ...)` in server components with locale-sensitive output**

The server (VPS Linux, en-US locale) and the user's browser (ru-RU) produce different number formatting when `undefined` is passed as locale:

```
// Server (en-US):  9500.toLocaleString(undefined) → "9,500"  (comma separator)
// Browser (ru-RU): 9500.toLocaleString(undefined) → "9 500"  (space separator)
```

Verified live in browser:
- `(9500).toLocaleString()` → `"9 500"` (ru-RU)
- `(9500).toLocaleString('en-US')` → `"9,500"`

**Affected files (server components rendering locale-sensitive numbers without explicit locale):**

1. `/app/dashboard/page.tsx:83`
   ```ts
   `~${t.currency} ${t.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
   ```
   This string is passed as `commissionLines` prop to `ActionPanel` (server component), rendered directly in JSX at `components/dashboard/ActionPanel.tsx:120`.

2. `/app/commission/page.tsx:46,49,62` — `d.freightAmount.toLocaleString()`, `d.commissionAmount.toLocaleString()`, `t.amount.toLocaleString()` (all without locale)

3. `/app/fixture/[id]/page.tsx:57,170` — `recap.commissionAmount?.toLocaleString()` (no locale)

4. `/app/cargo/[id]/page.tsx:289` — `Number(dwtRaw).toLocaleString()` (no locale)

5. `/app/summary/page.tsx:34` — `t.amount.toLocaleString()` (no locale)

6. `/app/api/ai/recap/route.ts:78` — `new Date(dates[0]).toLocaleDateString()` (no locale, no timeZone) — this creates date strings embedded in the recap data that SSR writes to HTML, and client re-renders differently.

**Secondary cause ruled out:**

- `MorningHeader.tsx:32` — already patched with `suppressHydrationWarning` + UTC pin ✓
- `SubsCountdown.tsx` — already patched with null sentinel + `suppressHydrationWarning` ✓
- `layout.tsx` `lang/dir` from `accept-language` — SSR sends `lang="ru"` which matches browser's `ru-RU` → no mismatch in this session ✓
- `audit-trail.tsx` `toLocaleTimeString(undefined, ...)` — this is `'use client'`, no SSR → not a source of #418

**Reproduction route confirmed:**
- `/dashboard` fresh load (any time)
- `/cargo/[id]` → `/email/[id]#highlight`

The #418 error is triggered on initial hydration of the dashboard/commission numbers, not specifically on SPA navigation transitions. SPA navigation just reveals it because the extension captures console messages across navigations.

## Proposed fix

**Fix: pin all server-side `toLocaleString()` calls to `'en-US'` (or extract a shared `formatNumber` utility with explicit locale)**

The pattern is the same that was already applied to `formatDate()` in `lib/utils.ts:19` (which correctly uses `'en-US'` + `timeZone: 'UTC'`).

1. Create/extend `lib/utils.ts` with a `formatNumber(n: number, opts?)` helper that always passes `'en-US'` as the locale parameter.

2. Replace all bare `.toLocaleString()` / `.toLocaleString(undefined, ...)` calls in server components with `formatNumber(n, opts)`.

3. For `api/ai/recap/route.ts:78` — pin `toLocaleDateString` to `'en-US'` + `timeZone: 'UTC'` (same as `formatDate` does).

**Affected locations to fix (6 files):**
- `app/dashboard/page.tsx:83`
- `app/commission/page.tsx:46,49,62`
- `app/fixture/[id]/page.tsx:57,170`
- `app/cargo/[id]/page.tsx:289`
- `app/summary/page.tsx:34`
- `app/api/ai/recap/route.ts:78`

No change needed for client-only components (`audit-trail.tsx`, `VesselsTab.tsx`, `VoyageBreakdownChart.tsx`, `RouteCompareModal.tsx`, `KpiCard.tsx`) — these run only post-mount, no hydration risk.

**Note on `suppressHydrationWarning`:** This should NOT be used as the fix here — it only silences the warning, doesn't fix the actual mismatch. The correct fix is consistent locale on server and client.

## Assessment

βf3-04 patch (`suppressHydrationWarning` on `MorningHeader` and `SubsCountdown`) was correct for those two specific components, but incomplete — it missed the `toLocaleString(undefined)` pattern in server-side number formatting across 5+ pages. The root cause is a systematic locale inconsistency, not a one-off date rendering issue.
