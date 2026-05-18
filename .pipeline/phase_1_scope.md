# Phase 1 SCOPE — p9-sentry-wiring-v2

## Assumptions (Rule A)

Понимаю задачу как: wire @sentry/nextjs optional DSN — Sentry no-op когда DSN не задан.
Альтернатива: всегда включённый Sentry с fallback DSN.
Иду по opt-in: task явно требует zero overhead когда DSN absent.

## Current State

Already exist and correct:

- `sentry.server.config.ts` — guards on `SENTRY_DSN` (if dsn) Sentry.init(...)
- `sentry.edge.config.ts` — same guard
- `sentry.client.config.ts` — OLD webpack pattern, guards on NEXT_PUBLIC_SENTRY_DSN (TO DELETE)
- `instrumentation.ts` — loads server/edge configs
- `next.config.mjs` — withSentryConfig(nextConfig, { silent: true, org: "", project: "" })
- `.env.local.example` — SENTRY_DSN= and NEXT_PUBLIC_SENTRY_DSN= placeholders

## Files in Scope

| File                        | Action                                                    |
| --------------------------- | --------------------------------------------------------- |
| `instrumentation-client.ts` | CREATE — client Sentry init, NEXT_PUBLIC_SENTRY_DSN guard |
| `sentry.client.config.ts`   | DELETE — old webpack pattern                              |
| `app/global-error.tsx`      | CREATE — root error boundary, captureException            |
| `app/error.tsx`             | CREATE — root error UI                                    |
| `next.config.mjs`           | MODIFY — sourcemaps: { disable: true }                    |

## Interface Contracts

### instrumentation-client.ts

Module-level side effect (no exports needed):

```typescript
// Reads process.env.NEXT_PUBLIC_SENTRY_DSN
// If falsy (undefined / ""): Sentry.init is NOT called
// If truthy: Sentry.init({ dsn: <value>, tracesSampleRate: 1.0 }) is called
```

### sentry.server.config.ts (existing — interface only, no changes)

```typescript
// Reads process.env.SENTRY_DSN
// If falsy: Sentry.init NOT called
// If truthy: Sentry.init({ dsn: <value>, tracesSampleRate: 1.0 }) called
```

### app/global-error.tsx

```typescript
"use client";
// Props: { error: Error & { digest?: string }, reset: () => void }
// useEffect: calls Sentry.captureException(error) when error changes
// Must include <html><body> wrapper (Next.js requirement for global-error)
// Renders a reset button that calls reset()
```

### app/error.tsx

```typescript
"use client";
// Props: { error: Error & { digest?: string }, reset: () => void }
// No Sentry call (global-error handles it)
// Renders error message and reset button
```

## Rule G

Triggered: YES — ≥3 production files in scope.
Mode: Phase 2a (test-author cold-context) → Phase 2b (impl).

## Boundary Classes Planned

- Class 1 (Empty): NEXT_PUBLIC_SENTRY_DSN="" (empty string) → should NOT init Sentry
- Class 7 (Config): env var names consistent across configs
- Class 9 (E2E): Sentry.init called/not-called verifiable via jest module isolation
