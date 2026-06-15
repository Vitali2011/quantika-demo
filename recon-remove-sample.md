# RECON: Remove "Try with sample data" feature

**Branch:** `claude/remove-sample-data`  
**Scope:** Read-only investigation — no code changed.

---

## (1) PublicLanding.tsx — button to replace

**File:** `components/PublicLanding.tsx:43–50`

Current markup (lines 43–50):
```tsx
<form method="POST" action="/api/sample">
  <button
    type="submit"
    className="w-full px-8 py-3 bg-ds-surface border border-ds-border text-ds-text font-medium rounded-ds-lg hover:bg-ds-surface-muted transition-colors text-sm"
  >
    Try with sample data
  </button>
</form>
```

Exact replacement JSX (drop-in, keeps identical visual styling as the secondary CTA):
```tsx
<Link
  href="/login"
  className="inline-block px-8 py-3 bg-ds-surface border border-ds-border text-ds-text font-medium rounded-ds-lg hover:bg-ds-surface-muted transition-colors text-sm"
>
  View demo →
</Link>
```

Note: `Link` is already imported at line 1 (`import Link from 'next/link'`). No new import needed.

---

## (2) app/api/sample/ — endpoint to delete

**Delete entire directory:** `app/api/sample/`

Contents:
- `app/api/sample/route.ts` — POST handler, imports `createDemoSession` from `lib/sample-data/create-demo-session` (line 3) and `sampleRateLimiter` from `lib/rate-limit` (line 4). `sampleRateLimiter` stays in `lib/rate-limit.ts` (may be used elsewhere — see (6) below).
- `app/api/sample/__tests__/sample.test.ts` — fixture integrity test (checks JSON arrays are non-empty). Imports: `cargo-inquiries.json`, `vessel-positions.json`, `fixture-recaps.json`, `client-replies.json`, `documents.json`, `vessel-certs.json` — all from `@/lib/sample-data/`.

---

## (3) lib/sample-data/ — safe-to-delete vs keep

### Safe to delete (no importers outside the feature being removed):

| File | Why safe |
|------|----------|
| `lib/sample-data/create-demo-session.ts` | Only imported by `app/api/sample/route.ts:3` |
| `lib/sample-data/types.ts` | Only imported by `create-demo-session.ts` + `lib/sample-data/__tests__/rebase.test.ts` |
| `lib/sample-data/rebase.ts` | Only imported by `create-demo-session.ts:2` + `lib/sample-data/__tests__/rebase.test.ts:1` |
| `lib/sample-data/__tests__/rebase.test.ts` | Only tests `rebase.ts` / `types.ts` |
| `lib/sample-data/vessel-positions.json` | Only imported by: `app/api/sample/__tests__/sample.test.ts:12`, `__tests__/sample-data/demo-parsed-cargoes.test.ts:20` — both deleted |
| `lib/sample-data/fixture-recaps.json` | Only imported by: `app/api/sample/__tests__/sample.test.ts:13`, `__tests__/sample-data/demo-parsed-cargoes.test.ts:21` — both deleted |
| `lib/sample-data/documents.json` | Only imported by: `app/api/sample/__tests__/sample.test.ts:15`, `__tests__/sample-data/demo-parsed-cargoes.test.ts:23` — both deleted |
| `lib/sample-data/vessel-certs.json` | Only imported by: `app/api/sample/__tests__/sample.test.ts:16`, `__tests__/sample-data/demo-parsed-cargoes.test.ts:24` — both deleted |

### MUST NOT delete (active importers outside the feature):

| File | External importer(s) |
|------|----------------------|
| `lib/sample-data/cargo-inquiries.json` | `tests/auto-prequote/cron-demo.test.ts:24` · `__tests__/api/parse-cargo-demo-cache.test.ts:17` · `__tests__/e2e/skeptical-forwarder.spec.ts:146` · scripts |
| `lib/sample-data/client-replies.json` | `__tests__/encoding/utf8-mojibake.test.ts:14` · scripts |
| `lib/sample-data/demo-parsed-cargoes.ts` | `__tests__/sample/sample-demo-match.test.ts:9` · `__tests__/research/match-realism-stability.test.ts:16` |
| `lib/sample-data/demo-parsed-cargoes.json` | match-realism tests + `lib/__tests__/matching/match-realism-buckets.test.ts:171` + scripts |
| `lib/sample-data/demo-parsed-vessels.json` | same as above + `lib/sample-data/__tests__/source-text-validity.test.ts:18` + scripts |
| `lib/sample-data/rebase-parsed.ts` | `scripts/demo-seed/real-matches.ts:46` · `__tests__/sample-data/rebase-parsed.test.ts:7` · `__tests__/research/match-realism-stability.test.ts:20` |
| `lib/sample-data/synthetic-economics.ts` | `lib/matching/__tests__/persist-session-matches-m3.test.ts:17` · `persist-session-matches-multi-item.test.ts:9` · `persist-session-matches-fit.test.ts:18` · `matches-repository-vessel-name.test.ts:18` · `persist-session-matches-worksheet-filters.test.ts:10` |
| `lib/sample-data/sanction-corpus/` | `lib/sanctions/match-engine.ts:12` · `lib/sanctions/sentinel.ts:14` (runtime code!) |
| `lib/sample-data/demo-scenarios/` | `app/api/demo-scenarios/[id]/route.ts:2` (separate live feature) |
| `lib/sample-data/imo/cii.json` | `lib/__tests__/psc-fixture.test.ts:8` |
| `lib/sample-data/market/` | referenced as CSV boot-time fallback in `lib/session-store.ts:56` comment (indirect) |
| `lib/sample-data/deals.ts` | `scripts/sentinel-scan.ts:24` |
| `lib/sample-data/sof-events/` | 0 importers found (already flagged as dead code in `docs/audits/2026-05-28-dead-code-audit.md:48`), but out of scope for this PR |

---

## (4) Constants DEMO_ECONOMICS_MATCH, DEMO_LOW_CONFIDENCE_MATCHES, DEMO_INSUFFICIENT_DATA, isSampleData

**`DEMO_ECONOMICS_MATCH`**, **`DEMO_LOW_CONFIDENCE_MATCHES`**, **`DEMO_INSUFFICIENT_DATA`** — all declared as `const` (not exported) inside `lib/sample-data/create-demo-session.ts:18,31,56`. No external consumers. Safe to delete with the file.

**`isSampleData`** — field on `Session` in `lib/types.ts:669`. **MUST KEEP** — also set by `lib/demo-mode/hydrate-demo-session.ts:243` for DEMO_MODE sessions. Removing it would break the DEMO_MODE workspace (which is the replacement the founder wants). Do NOT remove from `lib/types.ts`.

There is one stale comment in `app/api/ai/match/route.ts:14`:
```
/** Demo match IDs — must stay in sync with /api/sample/route.ts */
```
This comment becomes stale after deletion. Update to remove the sync note.

---

## (5) middleware.ts AUTH_BYPASS_PATHS

**File:** `middleware.ts`

- **Line 50:** `'/api/sample',` — remove this entry from the `AUTH_BYPASS_PATHS` Set.
- **Line 194:** comment `// /processing requires a csrf_token cookie (set by Google OAuth or /api/sample).` — update to remove `/api/sample` reference (Google OAuth is the only setter after deletion).

---

## (6) middleware-auth test

**File:** `__tests__/middleware-auth.test.ts:78`

```ts
'/api/sample',   // line 78 in bypassPaths array
```

Remove this entry from the `bypassPaths` array in the `bypass paths (no auth required)` describe block.

---

## (7) Other test files exercising /api/sample or sample-data

| File | Line | What it tests | Action |
|------|------|---------------|--------|
| `__tests__/api/sample-route.test.ts` | 1–129 | POST /api/sample (CSRF, redirect, cookies, isSampleData session) | **DELETE** |
| `app/api/sample/__tests__/sample.test.ts` | 1–n | fixture structural integrity | **DELETE** (with directory) |
| `__tests__/sample-data/demo-parsed-cargoes.test.ts` | 1–n | corpus-derived emailId integrity | **DELETE** |
| `__tests__/components/public-landing.test.tsx:31` | 31 | `expect(screen.getByText(/Try with sample data/i))` | **EDIT** — replace with assertion for `/login` Link |

The public-landing test also has at line 28–32:
```ts
it('renders CTA buttons', () => {
  render(<PublicLanding />);
  expect(screen.getByText(/Connect Gmail/i)).toBeInTheDocument();
  expect(screen.getByText(/Try with sample data/i)).toBeInTheDocument();  // ← line 31
});
```
Change line 31 to match the new button text (e.g., `/View demo/i`) and verify the link has `href="/login"`.

---

## (8) sampleRateLimiter in lib/rate-limit.ts

**Check before deleting:** `lib/rate-limit.ts` exports `sampleRateLimiter`. After `app/api/sample/route.ts` is deleted, grep confirms only one consumer:

```
grep -rn "sampleRateLimiter" lib/ app/ __tests__/
→ lib/rate-limit.ts (def)
→ app/api/sample/route.ts:4 (only consumer)
```

**Action:** After deleting the route, also delete the `sampleRateLimiter` export from `lib/rate-limit.ts` (it's the only importer — no other file uses it). Verify via grep before touching.

---

## (9) isSampleData handling — OPTIONAL cleanup only

These API guards check `session.isSampleData` to short-circuit LLM calls for pre-seeded sessions. They remain valid for DEMO_MODE sessions (which also set `isSampleData: true` via `lib/demo-mode/hydrate-demo-session.ts:243`). **Do NOT touch these** as part of this PR — they are not dead code.

For completeness (flag as OPTIONAL, not required):

| File | Line | What it does |
|------|------|-------------|
| `app/api/emails/fetch/route.ts` | 29–33 | Skip Gmail fetch for sample/demo sessions |
| `app/api/ai/classify/route.ts` | 57 | Use cached classifications for demo sessions |
| `app/api/ai/parse-cargo/route.ts` | 65 | Use cached parsed cargoes for demo sessions |
| `app/api/ai/parse-vessel/route.ts` | 35 | Use cached parsed vessels for demo sessions |
| `app/api/ai/match/route.ts` | 142–144 | Preserve demo economics match in sample sessions |
| `app/matches/page.tsx` | 45 | MATCHES_ENABLED bypass for demo sessions |
| `app/dashboard/page.tsx` | 101–103 | "Sample data" badge in header |
| `app/api/auth/login/route.ts` | 81–82 | Stale comment about createDemoSession (can delete comment only) |

Corresponding tests that test these guards (KEEP — they guard DEMO_MODE behavior too):
- `__tests__/api/classify-demo-cache.test.ts`
- `__tests__/api/parse-cargo-demo-cache.test.ts`
- `__tests__/api/parse-vessel-demo-cache.test.ts`
- `__tests__/api/emails-fetch.test.ts` (isSampleData lines)
- `__tests__/matches-page.test.tsx` (isSampleData conditional guard)
- `lib/demo-mode/__tests__/hydrate-demo-session.test.ts`

---

## REMOVAL CHECKLIST (ordered, safe to execute sequentially)

### Files to DELETE

```
app/api/sample/route.ts
app/api/sample/__tests__/sample.test.ts
app/api/sample/                         ← directory after emptied

lib/sample-data/create-demo-session.ts
lib/sample-data/types.ts
lib/sample-data/rebase.ts
lib/sample-data/__tests__/rebase.test.ts
lib/sample-data/vessel-positions.json
lib/sample-data/fixture-recaps.json
lib/sample-data/documents.json
lib/sample-data/vessel-certs.json

__tests__/api/sample-route.test.ts
__tests__/sample-data/demo-parsed-cargoes.test.ts
```

### Files to EDIT

1. **`components/PublicLanding.tsx`** (lines 43–50) — replace `<form>` block with `<Link href="/login">` (exact JSX in section 1 above).

2. **`middleware.ts`**
   - Line 50: delete `'/api/sample',`
   - Line 194: edit comment — remove reference to `/api/sample`.

3. **`__tests__/middleware-auth.test.ts`**
   - Line 78: delete `'/api/sample',` from `bypassPaths` array.

4. **`__tests__/components/public-landing.test.tsx`**
   - Line 31: change `expect(screen.getByText(/Try with sample data/i)).toBeInTheDocument()` to assert the new Link (`/View demo/i` or whatever text is chosen) with `href="/login"`.

5. **`lib/rate-limit.ts`** — grep first to confirm `sampleRateLimiter` has no other consumers, then delete its export.

6. **`app/api/ai/match/route.ts`** — line 14: update stale JSDoc comment (remove "must stay in sync with /api/sample/route.ts").

7. **`app/api/auth/login/route.ts`** — lines 81–82: delete stale comment about createDemoSession (cosmetic only).

### lib/sample-data/ cargo-inquiries.json and client-replies.json: DO NOT DELETE
These remain — used by unrelated tests (auto-prequote, encoding, e2e).

### Sanction corpus, demo-scenarios, synthetic-economics, imo/, market/: DO NOT TOUCH
All have live runtime or test consumers outside the sample-data feature.

---

## Summary

**Total files deleted:** 13 (route + 2 tests + 7 lib/sample-data files + 3 test files)  
**Total files edited:** 7  
**No dangling imports after removal** provided the checklist is followed in order.  
**isSampleData field stays** in lib/types.ts — still set by DEMO_MODE.  
**lib/sample-data/ directory stays** — most of it serves other purposes (sanction corpus, matching tests, demo-scenarios API, research benchmarks).
