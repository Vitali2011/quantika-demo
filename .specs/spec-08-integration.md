# Spec 08: Integration Wiring + Smoke Tests

> Batch: 3 | Complexity: simple | Est: 20 min | Files: 4

## Project Context

- **Project:** quantika-demo
- **Path:** /root/quantika-demo
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Architecture:** Full app with all specs merged
- **Test command:** `npm test`
- **Lint command:** `npx tsc --noEmit`

## Dependencies

**Requires completed:** ALL previous specs (00-07)

## Requirements

### Integration + Navigation Wiring

1. Modify `app/dashboard/page.tsx`:
   - Add navigation link to /voyage-calc ("TCE Calculator" button/link)
   - Container emails (from spec-07 sample data) should appear in Inbox Breakdown under new category "Container Inquiries"
   - Time Charter emails should appear with correct TC badge/type

2. Modify `components/ui/navigation.tsx` (or header/nav component):
   - Add "Voyage Calculator" link in navigation
   - Ensure all pages are accessible from dashboard

3. Update `scripts/smoke-test.sh`:
   - Add checks for new pages:
     - /voyage-calc returns 200
     - /container/sample-* returns 200 (container sample pages)
     - /fixture/sample-14 contains "Subs Status" section
     - /commission shows "EUR" for NORTHSTAR recap
   - Add check: draft-quote API returns rate intelligence data

4. Run final quality checks:
   - `npx tsc --noEmit` — full TypeScript compilation
   - `npm test` — all tests pass
   - Verify no console.log in production code
   - Verify no TODO/FIXME/placeholder

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `app/dashboard/page.tsx` | modify | Add TCE link, container category |
| `components/ui/navigation.tsx` | modify | Add voyage-calc nav link |
| `scripts/smoke-test.sh` | modify | Add new page checks |
| `app/layout.tsx` | modify | Ensure new routes in layout |

## Files FORBIDDEN

None — all specs are merged. But prefer minimal changes.

## Acceptance Criteria

- [ ] /voyage-calc accessible from dashboard navigation
- [ ] Container sample emails visible in dashboard breakdown
- [ ] TC request (sample-13) shows TIME_CHARTER badge
- [ ] Smoke test passes: `bash scripts/smoke-test.sh`
- [ ] `npm test` all tests pass
- [ ] `npx tsc --noEmit` compiles
- [ ] `grep -rn "console.log" src/ lib/` — no debug logs
- [ ] `grep -rn "TODO\|FIXME" src/ lib/` — no placeholders

## Constraints

- Minimal changes — only wiring and navigation
- Do NOT implement new features
- Do NOT modify core logic from other specs
- This is the final integration step

## How to Execute

1. Read this spec fully
2. Connect to VPS: `ssh root@<VPS_IP>`
3. `cd /root/quantika-demo && git checkout main && git pull`
4. Verify ALL specs (00-07) are merged: `git log --oneline -20`
5. `git checkout -b spec/spec-08-integration`
6. Implement requirements in order
7. `npm test && npx tsc --noEmit`
8. `bash scripts/smoke-test.sh`
9. `git add app/dashboard/ components/ui/ scripts/ app/layout.tsx && git commit -m "spec-08: integration wiring and smoke tests"`
10. `git push -u origin spec/spec-08-integration`

IMPORTANT: Do NOT merge into main.
