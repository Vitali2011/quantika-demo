# Phase 1 SCOPE — feat(stubs): /upgrade + /matches real content

## Assumptions (Rule A)

Понимаю задачу как: превратить 2 заглушки в статичные страницы с реальным UX-контентом.
Альтернатива: добавить backend (API/matches). Иду по статичным страницам потому что: задача явно говорит "без backend", mock data + TODO comment.

## Files in Scope

Can Change:
- app/upgrade/page.tsx
- app/matches/page.tsx
- app/__tests__/upgrade-page.test.tsx (NEW)
- app/__tests__/matches-page.test.tsx (NEW)
- __tests__/pages/upgrade-page.test.tsx (update 1 expectation)
- __tests__/pages/matches-page.test.tsx (update 2 expectations)

Cannot Change: backend/API, middleware, session

## PI3 count: 3 intentional changes (< 6 limit) — proceed

## Tier data
Free: 5 deals/month, basic match, email digest
Pro: unlimited deals, AI explain-deal, WhatsApp digest, RAG clauses
Enterprise: SSO, white-label, dedicated support, API access
CTA: mailto:sales@quantika.org

## /api/matches: NOT FOUND → use DEMO_MATCHES static array + TODO comment

## Rule G triggered (≥3 files)
Phase 2a: test-author writes app/__tests__/ files
Phase 2b: impl writes pages + updates __tests__/pages/ stubs
