## Spec Summary
1. Создать `lib/dashboard-queries.ts` — filterByCategory, groupEmailsByStatus, getEmailCounts
2. Создать `components/dashboard/` — EmailCard, EmailSection, ActionPanel
3. Уменьшить `app/dashboard/page.tsx` до ≤200 LOC
4. Написать ≥8 тестов в `lib/__tests__/dashboard-queries.test.ts`

## Affected Files
- `app/dashboard/page.tsx` (591→≤200 LOC) — modify
- `lib/dashboard-queries.ts` — create
- `lib/__tests__/dashboard-queries.test.ts` — create
- `components/dashboard/EmailCard.tsx` — create (EmailListItem + StatusBadge)
- `components/dashboard/EmailSection.tsx` — create (CategorySection)
- `components/dashboard/ActionPanel.tsx` — create (action blocks)
- `components/dashboard/index.ts` — create

## Boundaries
### Can Change:
- app/dashboard/page.tsx, lib/dashboard-queries.ts, components/dashboard/

### Cannot Change:
- API routes, lib/session.ts, функциональность UI

## Overlap Check
Один фронт — нет пересечений.

## Open Questions
Нет.
