# Blind head-to-head — war-risk solutions

Two candidate solutions, **A** and **B**, solved the SAME task. Decide which is better
OVERALL. Weigh in order: (1) correctness of the three requirements, then (2) code quality,
scope discipline, and test quality. Do NOT reward length or extra unrelated changes. If the
two are genuinely indistinguishable in merit, answer "tie" — but prefer to pick a winner.

## The task both solved

- **Д1:** source the live JWC rate from `data/knowledge/jwc/2025-current.yaml` (zone JWLA-033)
  instead of the hardcoded `0.075%`, with a hardcoded fallback when the file/zone is missing,
  and surface which source (live vs fallback) was used.
- **Д2:** a small, memoized, tolerant YAML loader (separate from the existing parser) that
  returns `null` on ANY error without throwing, mapping zone IDs and converting pct→fraction,
  with no edits to the existing parser/schema/migrations/RAG.
- **Д3:** a voyage that transits Suez (via `route.viaCanal`) gets the `red-sea-hra` premium
  even with no HRA endpoint; a non-transit, non-HRA voyage does NOT.

Output ONLY a single JSON object, nothing else:
{"winner":"A"|"B"|"tie","reason":"one concise sentence on the deciding factor"}
