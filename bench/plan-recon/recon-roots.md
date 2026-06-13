# Gold root causes — JUDGE INPUT ONLY. Never include in a recon run brief.

## t976 — implausible capacity (fix d7fa1f9a / qa #976)

ROOT: the grain/bale capacity arrives unit-less in the source (e.g. a value like "G/B 220.577")
and is interpreted as cubic METRES (cbm) when it is actually cubic FEET (cbft). The cbft→cbm
factor is ~35.3, so the normalizer stores a ~30× inflated cbm for those vessels. The shipped fix
nulls/clamps grain/bale capacity when it exceeds ~2.5× DWT (an implausible upper bound),
symmetrically with the pre-existing lower bound.
ACCEPT as root-found: candidate identifies the unit misread (cbft read as cbm) OR the missing
upper-bound plausibility clamp on capacity-vs-DWT as the cause of the ~30× inflation.
SYMPTOM-ONLY (score 1): candidate only restates "capacity too large / >DWT" or blames the UI/display
without locating the unit/normalizer cause.

## t975 — deep-link 404 after rehydrate (fix c1e4e836 / qa #975)

ROOT: detail routes are keyed by a numeric, session-scoped match-id that is regenerated when the
demo session rehydrates, so a deep-link id captured before rehydrate no longer resolves afterwards
→ 404. Routes keyed by a stable id (gmail-id) survive; the rehydrate-guard did not cover the detail
routes. The shipped fix extends the rehydrate-guard to the detail routes and adds a re-persist /
getMatchBySlug fallback for the stale numeric match-id.
ACCEPT as root-found: candidate identifies that the detail-route id is session-scoped/regenerated on
rehydrate (stale id) AND/OR that the rehydrate-guard does not cover those routes.
SYMPTOM-ONLY (score 1): candidate only says "session data is missing after rehydrate" or "route not
found" without pinpointing the stale/regenerated id or the guard gap.
