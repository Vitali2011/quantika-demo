# Issue #588 — Dashboard primary CTAs navigate to /match/0 → 404

**Source:** /qa-walker baseline 2026-05-27. На /dashboard первый клик в TO DO TODAY или FRESH MATCHES → переход на /match/0 → Next.js 404.

**Tier:** S-M (1-3 файла, href fix или seed data) · creative=no · risk-override (routing-adjacent) → M minimum · unknown-root-cause → hypothesis-tree

## Hypothesis tree

- **H1: Demo seed data has match.id = 0.** Database has rows where `matches.id = 0`. Frontend correctly renders `/match/${e.id}` но БД содержит ID=0. Fix: либо seed migration исключает id=0, либо migrate existing rows.
- **H2: Component closure passes 0 instead of real id.** `<a href={\`/match/\${match.id || 0}\`}>` или подобный fallback — когда match.id undefined, рендерит /match/0. Fix: убрать `|| 0` ИЛИ guard `match.id ? <Link/> : null`.
- **H3: API returns matches array, frontend reads wrong field.** Например `m.match_id` vs `m.id` — отсюда undefined → fallback 0. Fix: align field names.
- **H4: SSR/RSC race — match data not yet hydrated.** Initial render с empty matches, click до hydration. Fix: disable CTAs until data loaded.

## Investigation steps

1. Grep `\`/match/\${` или `\`/match/0\`` или `match.id` в `app/dashboard/` и shared components
2. Inspect rendered DOM на /dashboard → точно ли `<a href="/match/0">` или `<a href="/match/undefined">` (последнее = другой fix)
3. Check API `/api/dashboard` response shape (или подобный) → есть ли matches с id=0
4. If H2/H3 — fix in 1 file (dashboard component)
5. If H1 — seed migration

## Fix scope

Most likely H2 или H3 (related to #515 closure pattern, per QA Walker report). 1-2 files:
- `app/dashboard/page.tsx` ИЛИ `app/dashboard/DashboardClient.tsx`
- Behavioral test: render dashboard, click TO DO TODAY CTA, assert URL != `/match/0`

## Out of scope
- #589 AI hallucination
- /matches list page (separate issue)
- Backend seed migrations if H2/H3 sufficient

## QA gate
- jest --findRelatedTests app/dashboard/ green
- Manual playwright: login + /dashboard → click first task → URL = /match/<valid-id>

## Related
- #515 (`/match/undefined` on /matches row click — likely shared closure pattern)
