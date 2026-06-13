# Planning task — war-risk premium (PLAN ONLY)

PLANNING MODE — read-only. Produce an IMPLEMENTATION PLAN only. Do NOT edit files, do NOT
write code. Read the repo as needed. Your plan will be handed to a SEPARATE engineer who will
implement it exactly as written and is judged only on whether the resulting code passes hidden
tests — so the plan must be complete and unambiguous: exact files to touch, what each change
does, the function/loader shapes, and which unit tests to add.

You are in the quantika-demo repo (maritime freight matching). Plan the following three fixes to
the war-risk premium calculation. Do NOT plan changes to parsers, DB migrations, or the
RAG/knowledge ingestion path.

## Д1 — replace the stale hardcoded JWC rate with a live, staleness-aware rate

`lib/economics/war-risk.ts` uses a hardcoded `0.075%` effective `2024-01-01`. Source the current
rate live from `data/knowledge/jwc/2025-current.yaml` (zone JWLA-033). Keep a hardcoded fallback if
the file/zone is missing or unreadable. Surface which source was used (live vs fallback) on the result.

## Д2 — single source of truth via a tolerant YAML loader

Add a small, memoized, tolerant YAML loader (economics-local) that reads the JWC zones from
`2025-current.yaml`, maps zone IDs to the calculator's zone IDs, converts pct→fraction, and returns
`null` on ANY error without throwing. Do not modify the existing YAML parser, schema, or migrations.

## Д3 — thread Suez-transit detection into the HRA premium

`viaCanal` is not threaded into the premium logic. A voyage that TRANSITS the Suez canal must trigger
the `red-sea-hra` premium EVEN IF neither endpoint is an HRA port; a voyage that does not transit Suez
and has no HRA port must NOT get it. Plan the transit detection and wiring, both directions.

## Your output

A complete, step-by-step implementation plan (files, changes, loader/function shapes, unit tests).
No code edits — the plan text is your entire deliverable.
