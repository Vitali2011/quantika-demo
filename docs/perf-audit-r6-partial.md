# Bundle Perf Audit — R6-partial

**Date:** 2026-05-24  
**Branch:** design/r6-partial-a11y-perf  
**Tool:** @next/bundle-analyzer (webpack mode)  
**Command:** `npm run analyze` (= `ANALYZE=true next build --webpack`)

> **Note:** Next.js 16 uses Turbopack by default. Bundle analyzer requires webpack mode (`--webpack` flag).
> Use `npm run analyze` (added to package.json in this PR).
> Interactive HTML reports: `.next/analyze/{client,nodejs,edge}.html`

---

## Top-5 Heavy Chunks (raw / gzip)

| Rank | Chunk | Raw | Gzip | Notes |
|------|-------|-----|------|-------|
| 1 | `4657-*.js` | 461 kB | 142 kB | Vendor bundle — likely @base-ui/react + lucide-react |
| 2 | `main-*.js` | 410 kB | 129 kB | Next.js main runtime + client router |
| 3 | `4bd1b696-*.js` | 195 kB | 61 kB | React DOM (client error boundaries) |
| 4 | `framework-*.js` | 185 kB | 58 kB | React + React-DOM core |
| 5 | `9da6db1e-*.js` | 183 kB | 60 kB | Vendor — class-variance-authority + tailwind-merge |

**Honourable mention:**
- `app/match/[id]/page-*.js` — 143 kB raw / 32 kB gzip — match detail page (largest page chunk)
- `polyfills-*.js` — 110 kB raw / 39 kB gzip — Next.js polyfills

---

## First-load JS per route (estimated from chunks)

Dashboard, Matches, Design pages each load:
- framework (~58 kB gz) + main (~129 kB gz) + page-specific (<20 kB gz)
- **Estimated first-load: ~210–230 kB gzip** — over the 200 kB target for dashboard/matches

`match/[id]` page: higher at ~270 kB gzip due to 32 kB page chunk + shared.

---

## Recommendations (R6-final / R7)

1. **Chunk 1 (`4657`) — lucide-react tree-shaking** — verify all icon imports are named (not `import * from 'lucide-react'`). Expected saving: 30–60 kB raw.
2. **Main chunk** — Next.js router client is fixed overhead; consider route prefetch tuning.
3. **match/[id] page** — 143 kB page chunk is large. Audit for heavy inline dependencies (fuzzysort, searoute-ts). Dynamic-import heavy sections.
4. **posthog-js** — check if loaded eagerly. Should be `dynamic(() => import('posthog-js'), { ssr: false })`.
5. **pdfkit** — server-only, but verify it's not leaking into client bundle.

---

## Analyzer reports

After running `npm run analyze`, open:
- `.next/analyze/client.html` — client-side bundle treemap
- `.next/analyze/nodejs.html` — server bundle treemap
- `.next/analyze/edge.html` — edge runtime (middleware)
