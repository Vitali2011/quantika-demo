# Task: war-risk premium — live JWC rates + Suez-transit detection

You are working in the quantika-demo repo (maritime freight matching). Implement the
following three fixes in the war-risk premium calculation. Do NOT change parsers,
DB migrations, or the RAG/knowledge ingestion path. Add focused unit tests for your
own work. Produce a short shift-table (old vs new premium by route) at the end.

## Д1 — replace the stale hardcoded JWC rate with a live, staleness-aware rate

`lib/economics/war-risk.ts` uses a hardcoded `0.075%` effective `2024-01-01`. Source the
current rate live from `data/knowledge/jwc/2025-current.yaml` (zone JWLA-033). Keep a
hardcoded fallback if the file/zone is missing or unreadable. Surface which source was
used (live vs fallback) on the result.

## Д2 — single source of truth via a tolerant YAML loader

The rate currently has two sources of truth. Add a small, memoized, tolerant YAML loader
(economics-local) that reads the JWC zones from `2025-current.yaml`, maps zone IDs to the
calculator's zone IDs, converts pct→fraction, and returns `null` on ANY error without
throwing. Do not modify the existing YAML parser, schema, or migrations. Do not touch the
RAG path.

## Д3 — thread Suez-transit detection into the HRA premium

Today `viaCanal` is not threaded into the premium logic. A voyage that TRANSITS the Suez
canal must trigger the `red-sea-hra` premium EVEN IF neither endpoint is an HRA port.
Implement transit detection and wire it so a Suez-transit voyage gets the Red Sea HRA
premium. A voyage that does not transit Suez and has no HRA port must NOT get it.

## Done when

- All three fixes implemented with focused unit tests passing.
- Shift-table printed (old vs new premium per route; no LLM calls).
- No changes to parser/migrations/RAG.
