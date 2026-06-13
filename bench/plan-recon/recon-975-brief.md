# Recon task — detail deep-link 404 after rehydrate

RECON MODE — read-only investigation. Do NOT edit files. Do NOT write code or a fix.
Read the repo as needed (Read/Grep/Glob/Bash-grep) and find the single ROOT CAUSE.

## Symptom (what was observed)

In the demo, opening a detail page directly by its URL (a deep-link to a match/vessel/fixture
detail route) returns 404 — but ONLY after the demo session has "rehydrated" (re-seeded its
in-memory session data). The very same detail page opens fine when navigated to from inside
the app. Some detail routes survive a direct deep-link; at least one route 404s every time
after rehydrate.

## Your output (exactly these three)

1. ROOT CAUSE — one or two sentences naming the actual underlying cause (not the symptom).
2. LOCATION — the file(s)/function where it originates.
3. MECHANISM — why navigating from inside the app works but a direct deep-link 404s post-rehydrate.
