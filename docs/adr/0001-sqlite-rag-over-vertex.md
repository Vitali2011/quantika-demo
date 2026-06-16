# ADR-0001: SQLite RAG как дефолт вместо Vertex AI Search

## Status

Accepted (2026-05-17)

## Context

Базе знаний нужен RAG-ретривер (поиск по нормативке: IMSBC, IGC, JWC, BIMCO).
Изначально целились на **Vertex AI Search** (Google) — managed-сервис,
не нужно держать своё векторное хранилище.

На проде выяснилось: `extractiveContentSpec` (ключевая фича Vertex Search,
которая возвращает релевантные фрагменты) доступен **только на Enterprise-tier**.
На Standard-tier — 100% отказов. Был prod-инцидент, откат пришлось делать
вручную.

Альтернатива — локальный **SQLite + sqlite-vec** (расширение vec0): векторный
поиск 768-мерными эмбеддингами прямо в файловой БД, без внешнего сервиса и без
Enterprise-биллинга.

## Decision

RAG-ретривер по умолчанию работает на **SQLite (sqlite-vec)**.

- Диспетчер [`retriever.ts`](../../lib/knowledge/embeddings/retriever.ts) маршрутизирует по
  env `KNOWLEDGE_BACKEND`: значение `"vertex"` → Vertex AI, всё остальное →
  SQLite (дефолт). Правила зафиксированы в
  [`.claude/rules/retriever.md`](../../.claude/rules/retriever.md).
- Vertex-код — за `await import(...)` (lazy), чтобы SDK не тянулся в
  SQLite-режиме.
- Имена таблиц — строго allowlist: `imsbc_vec/fts`, `igc_vec/fts`,
  `jwc_vec/fts`, `bimco_vec/fts`. Любое другое имя → исключение.
- Мастер-флаг `KNOWLEDGE_RAG_ENABLED=true` обязателен; иначе
  `throw Error('RAG is not enabled')`.

## Consequences

**Плюсы:**

- Нет зависимости от Enterprise-биллинга Google; нет того prod-инцидента.
- Поиск работает офлайн/локально, дёшево, предсказуемо.
- Vertex остаётся подключаемым опционально (`KNOWLEDGE_BACKEND=vertex`) —
  решение обратимо.

**Минусы / trade-offs:**

- Векторы строго `Float32Array[768]` — другая размерность бросает `RangeError`.
  Сменишь embedding-модель → нужно переиндексировать.
- Масштаб ограничен размером SQLite-файла (для demo-объёмов знаний — ОК).
- При добавлении нового бэкенда регистрировать его в `knowledgeBackend()` в
  [`lib/knowledge/flags.ts`](../../lib/knowledge/flags.ts), а не в `retriever.ts`
  напрямую.

> Историческая справка по инциденту — memory
> `project_quantika_demo_vertex_broken_2026_05_17`.
