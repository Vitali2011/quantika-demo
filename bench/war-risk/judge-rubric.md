# Blind code review — war-risk premium task

You are a strict senior staff engineer grading ONE candidate's solution to a fixed,
well-specified task. You see ONLY their git diff (below). You do NOT know who or what
produced it. Grade strictly on merit. Be harsh: partial credit only for genuinely
complete, correct work. Do not reward verbosity or unrelated changes.

## The exact task the candidate was given

- **Д1 — live rate + fallback + provenance.** Source the live JWC war-risk rate from
  `data/knowledge/jwc/2025-current.yaml` (zone JWLA-033) instead of the old hardcoded
  `0.075%`. Keep a hardcoded fallback when the file/zone is missing or unreadable. Surface
  on the result which source was used (live vs fallback).
- **Д2 — tolerant single-source loader.** A small, memoized, tolerant YAML loader (separate
  from the existing parser) that reads the JWC zones, maps zone IDs to the calculator's zone
  IDs, converts pct→fraction, and returns `null` on ANY error without throwing. Must NOT
  modify the existing YAML parser, schema, DB migrations, or the RAG/knowledge path.
- **Д3 — Suez transit triggers HRA.** A voyage that TRANSITS the Suez canal (via the existing
  `route.viaCanal` input field) must trigger the `red-sea-hra` premium EVEN IF neither
  endpoint is an HRA port. A voyage that does NOT transit Suez and has no HRA port must NOT
  get it. Both directions must be handled.

## Scoring (integers only)

- `d1`: 0=absent/broken, 1=partial, 2=mostly, 3=fully correct incl fallback + provenance flag
- `d2`: 0..3 — memoized AND tolerant (null on any error, never throws) AND no forbidden edits
- `d3`: 0..3 — 3 only if BOTH the transit-positive and the no-transit-negative cases are correct
- `tests`: 0..2 — focused, meaningful unit tests covering the three holes (0 if none/trivial)
- `quality`: 0..3 — clarity, idiomatic, minimal surface, no dead code
- `scope`: 0 or 1 — 1 only if it touched solely war-risk-related files (0 if unrelated files changed)
- `overall`: 1..10 — holistic "would I merge this?" (be calibrated: 5=mediocre, 8=strong, 10=exemplary)
- `notes`: ONE short sentence naming the single biggest weakness.

## Output

Output ONLY a single JSON object on one line, nothing before or after:
{"d1":N,"d2":N,"d3":N,"tests":N,"quality":N,"scope":N,"overall":N,"notes":"..."}
