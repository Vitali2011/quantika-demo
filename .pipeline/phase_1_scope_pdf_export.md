# Phase 1 — Scope: PDF Export of Match Results

## Assumptions

Понимаю задачу как: добавить кнопку на /matches, генерирующую PDF со всеми
видимыми матчами (с учётом текущих фильтров), и скачивать его через браузер.

Альтернатива: клиентская генерация (jspdf). Не иду по ней, потому что pdfkit
уже в зависимостях как server-side библиотека, а server-side удобнее для
контроля форматирования и не раскрывает raw data клиенту.

## Affected Files

| Файл                                     | Тип                 | Действие                                                                |
| ---------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| app/api/matches/export/pdf/route.ts      | New production      | GET endpoint: auth, feature flag, listMatches, pdfkit → binary Response |
| app/matches/MatchesClient.tsx            | Modified production | +1 кнопка "Export PDF" + handler window.open()                          |
| **tests**/api/matches-export-pdf.test.ts | New test            | Behavioral tests (Class 9): 401/503/200/PDF-magic-bytes/filters         |

## Rule B Check

- URL/path/HTML: Нет. Q1-chain не применяется.
- LLM endpoint: Нет. AbortController не нужен.
- Auth code: используем существующий requireSession pass-through.

## Rule D (Feature-flag wiring)

Нет нового feature flag. Endpoint гейтируется существующим MATCHES_ENABLED.

## Rule F (Admin endpoint whitelist)

/api/matches/export/pdf — НЕ под /api/admin/ → middleware whitelist не нужен.
Endpoint требует session cookie (requireSession), как все остальные /api/matches/\*.

## Rule G Trigger

- 2 production файла (< 3) → не триггерит.
- Domain: не parser, не auth code, не payments, не regex normalizer.
- Decision: single-agent TDD.

## Security Note (Phase 3: Security-Auditor)

Новый endpoint принимает query params от user → нужна проверка Phase 3.
