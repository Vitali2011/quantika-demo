---
paths:
  - lib/knowledge/embeddings/retriever*.ts
---

# Rules: lib/knowledge/embeddings/retriever\*

## Invariants

- Диспетчер `retriever.ts` маршрутизирует по `KNOWLEDGE_BACKEND`: `"vertex"` → Vertex AI, всё остальное → SQLite (дефолт).
- `KNOWLEDGE_RAG_ENABLED=true` — обязательный флаг для `searchVec0` и `retrieve` SQLite. При `false` — `throw Error('RAG is not enabled')`.
- Vec0 принимает только `Float32Array[768]`. Любая другая размерность → `RangeError`. Не использовать обычный `Array<number>`.
- Имена таблиц — строго из allowlist: `imsbc_vec/fts`, `igc_vec/fts`, `jwc_vec/fts`, `bimco_vec/fts`. SQLite выбросит исключение на произвольном имени.
- Vertex-бэкенд — lazy import (`await import(...)`), чтобы не тянуть SDK при sqlite-режиме.

## Anti-patterns (история регрессий)

- **Vertex AI Search сломан на Standard-tier**: `extractiveContentSpec` — Enterprise-only. При ошибке от Vertex — не молчать, делать явный fallback на SQLite или бросать наружу. Prod-инцидент: 100% failures, rollback потребовался вручную. (ref: memory project_quantika_demo_vertex_broken_2026_05_17.md)
- **topK > 1000 без clamp**: SQLite retriever делает clamp до 1000; Vertex может вести себя иначе — проверять при добавлении нового бэкенда.
- **Пустой query без guard**: `""` → возвращает `[]` без API-вызова. Не убирать этот early-return — иначе дорогой embed-вызов на пустой строке.

## Checklist перед commit'ом

- [ ] `KNOWLEDGE_RAG_ENABLED` проверяется перед обращением к БД
- [ ] Embedding — `Float32Array`, размерность 768
- [ ] Новый бэкенд добавлен в `knowledgeBackend()` в `flags.ts`, не в `retriever.ts` напрямую
- [ ] Vertex-код — за `await import()`, не на верхнем уровне модуля
