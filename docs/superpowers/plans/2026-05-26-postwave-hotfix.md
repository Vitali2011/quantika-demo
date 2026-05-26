# Hotfix post 12-bug wave (2026-05-26)

## Цель
Закрыть 2 real CI failure на main (sha fc5739e/f87d7eb), не related к 6 PR scope.

## Проблемы (из CI лога run 26448070272)
1. `app/matches/MatchesClient.tsx:88` — `setMatches` accessed at line 88 в useEffect, declared at line 94. `react-hooks/immutability` lint error. Введён в PR #550 (hydration #543 fix).
2. Header logout test fail — `expect(source).toContain("action=\"/api/auth/logout\"")` и `/Log\s+out/`. Введён в PR #548 (logo #491) или #546 (#508 BottomNav LogOut removed).

## Шаги
1. `cd /root/work/quantika-demo/.worktrees/fix-postwave-lint-tests`
2. Bug 1: переместить useEffect на line 88-92 ПОСЛЕ всех useState (после line 94+). Verify lint clean.
3. Bug 2: найти Header.tsx (или components/Header/). grep test failure expectations → восстановить `<form action="/api/auth/logout" method="POST"><button>Log out</button></form>` если оно было удалено целиком, или вернуть текст "Log out" в существующий logout механизм.
4. Run lint + affected tests локально на worktree
5. Commit + push + PR с `Closes` НИЧЕГО (это hotfix, не закрывает issue) — auto-merge label

## Acceptance
- npm run lint → 0 errors (warnings ok)
- jest header / matches affected tests → green
- PR создан, CI green, auto-merge через нормальный путь (НЕ --admin)

## Out-of-scope
- НЕ менять основную логику components (только fix-back lint + test)
- НЕ создавать новые тесты
- НЕ трогать другие файлы
