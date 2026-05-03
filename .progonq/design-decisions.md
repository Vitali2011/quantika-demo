# Design Decisions — quantika-demo MATCH_PROMPT progonq run

Anti-pattern: a cold-session QA agent re-discovers these every round and flags
them as bugs. Inject this file verbatim into every QA prompt to suppress false
positives.

This run targets `lib/prompts/match.ts` (matching + scoring rationale).
Decisions accumulate as the loop surfaces design-vs-bug disagreements.

---

## A. Inherited from email-parser run (v1.4.0-eval-qa, May 2026)

The matcher consumes structured cargo/vessel objects produced by the upstream
email parsers. Decisions established during their hardening still apply to any
QA judgement on the *content* of those objects:

### A.1 Routing of `original_sender` in forwarded emails
For VESSEL_POSITION forwards, `original_sender` is the **circulating broker**
(outer envelope), not the inner shipowner. For DOCUMENT/VESSEL_CERTIFICATE
forwards, the **forwarder** (e.g., shipping agent). For CARGO_INQUIRY forwards,
the **inner author** (cargo owner). Rationale: actionable counterparty for reply.

### A.2 Date conflict subject↔body
Use body value with `confidence='confirmed'`; log `unknown_terms[term=DATE_CONFLICT]`.
Do NOT halt processing. Subject lines have typos; body governs.

### A.3 Sub-lift + new clauses → FIXTURE_RECAP
Email that lifts subjects AND proposes new CP clauses classifies as FIXTURE_RECAP,
not CLIENT_REPLY. Pure sub-lift remains CLIENT_REPLY.

### A.4 TBC laycan → urgency=medium
For CARGO_INQUIRY where laycan dates are explicitly TBC/TBD/pending (e.g.,
"End May / Early June 2026 (exact dates TBC)"), urgency is `medium` regardless
of how soon the approximate window is. For specific dates within 30d → `high`.

### A.5 Zero-day certificate → urgency=high
For VESSEL_CERTIFICATE where `VALID FROM == VALID TO`, urgency MUST be `high`.
Zero-day validity = vessel cannot proceed.

### A.6 MOLOO bounds
`"abt 28,000 mts (10% MOLOO)"` →
- `weight_mt=28000` (nominal), `confidence='interpreted'` (due to "abt")
- `weight_mt_min=25200`, `weight_mt_max=30800` (±10% band)
MOLOO is owner's unilateral right; numeric bounds are the design.

### A.7 Midnight semantics in subs deadlines
"Midnight of [date]" = END of that day = 00:00 [date+1].
"48h from midnight today (3 May)" → from 00:00 4 May + 48h = 00:00 6 May.
This MATCHES "by 00:00 6 May LT" — no conflict.

---

## B. Matching-specific decisions (this run)

### B.1 Pre-filter trust contract
Per MATCH_PROMPT: "PRE-FILTERING HAS ALREADY HAPPENED". The matcher MUST trust
that input pairs already passed structural feasibility (draft, gearing, volume,
cargo-type, laycan inversion). The matcher's job is **scoring + rationale**, not
re-filtering. Therefore:

- If a pair appears in input → it is feasible by upstream contract.
- If QA agent thinks a pair is hard-infeasible (DWCC < cargo) **but it's in
  input**, that's still a CRITICAL finding — but the bug class is "matcher
  failed to honour hard filter that should have been re-checked", not "pre-filter
  is broken".

### B.2 Score is internal — NOT shown to user
Prompt explicitly says: "Do NOT show the numeric score to the user." QA agents
must NOT flag "score not visible in output" as a bug. The score field IS in the
JSON schema (for downstream sorting); just not surfaced in UI rationale.

### B.3 Inclusion policy: return ~N matches for N input pairs
Per prompt INCLUSION POLICY: matcher must return ~all pairs that pass hard
filters, including weak (20-45). Self-censoring is a bug. Curating to "top 3"
is HIGH severity.

### B.4 Readiness verdict is source of truth for timing
Prompt: "Use these numbers verbatim. Do NOT invent your own timing assessment."
If readiness says `verdict='ideal'` and matcher says `match_reasons: "timing
tight"`, that's HIGH. Conversely, if matcher cites readiness numbers verbatim,
that's correct behaviour — even if a broker would disagree with readiness.
(Disagreements with readiness algorithm = upstream bug, not matcher bug.)

### B.5 Class-default speed assumptions
Default 12.5 kn for handysize is in the prompt. If matcher uses 12.5 kn for ETA
math when vessel `service_speed` is null, that's NOT a bug — it's the documented
fallback. Only flag if matcher uses 12.5 kn while ignoring an explicit
`service_speed=14` in the input.

### B.6 Out-of-scope concerns (NOT flag as HIGH)
The matcher does NOT compute:
- Voyage P&L / freight rate suggestion
- Bunker procurement strategy
- Charter party clause drafting
- Owner/charterer credit checks
- Vetting (RightShip, OCIMF) — only flag CII grade if present in input
- Insurance/P&I match
QA agents may find these "missing", but they belong in `schema-gaps.md`, not
issues. Only fields/concerns documented in MATCH_PROMPT output schema are in scope.

---

## C. Adversarial-loop process decisions

### C.1 Full input verbatim to QA agent
NEVER paraphrase the corpus payload when constructing the QA prompt. Paste the
full `{cargo_inquiries, vessel_positions, readiness}` JSON. Else QA flags
verbatim quotes as "fabricated source data" — half-round wasted (lesson from
email-parser run, eval-05).

### C.2 Re-test all PASS cases after every prompt edit
Edits whack-a-mole. After Round N edits, re-run ALL cases (not just failed
ones) before declaring Round N+1 progress.

### C.3 Bundled execution mandate
Once user approves the loop start, runs autonomously through 2 PASS + harden
without re-asking. Mandate scope: prompt edits + commits inside this worktree.
Out of scope: deploy, force-push, branch deletion, edits outside lib/prompts/.
