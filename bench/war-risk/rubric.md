# Blind quality rubric — war-risk #957 replay (frozen 2026-06-13)

Score each axis 0-5. Judge sees ONLY a diff with author/model identifiers stripped.
Do not reward verbosity. Penalize scope creep.

1. Coverage of Д1 (live staleness-aware rate + fallback + source surfaced): 0-5
2. Coverage of Д2 (tolerant memoized loader, returns null on error, no parser/migration/RAG edits): 0-5
3. Coverage of Д3 (Suez-transit → red-sea-hra without HRA port; negative case respected): 0-5
4. Correctness/robustness (no throw on bad input, sensible fallbacks): 0-5
5. Discipline (surgical; did NOT touch parser/migrations/RAG; focused tests): 0-5

Output strict JSON: {"d1":N,"d2":N,"d3":N,"correctness":N,"discipline":N,"notes":"<=40 words"}
Judge composite = sum/25 (0..1).
