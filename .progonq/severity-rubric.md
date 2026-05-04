# Severity Rubric — Vessel/Cargo Matching (quantika-demo)

The matcher prompt receives `{cargo_inquiries, vessel_positions, readiness}` and returns
recommended `matches[]` with score/match_level/match_reasons/issues. Severity is judged
against the broker workflow it feeds.

## CRITICAL — would cause real money loss or vessel-stranded incident if trusted

- **Hard-filter bypass:** vessel recommended where DWCC < cargo MT, draft mismatch,
  or gearless vessel suggested for cargo at gearless port (cranes required).
- **Cargo-class mismatch recommended:** e.g., bulk-only vessel (no tween-decks, no
  cranes) recommended for project cargo / heavy-lift breakbulk.
- **Laycan inverted/typo silently accepted:** vessel arrival > laycan_end and still
  scored "good" or "possible" without surfacing the conflict in `issues`.
- **Sanctions exposure recommended without flag:** vessel under sanctioned
  flag/owner/P&I scored ≥ "possible" with no `issues[]` entry naming the sanction.

## HIGH — break the broker's downstream workflow

- **Fabricated vessel particulars in `match_reasons`:** number cited (DWT, draft,
  speed, hold cbm, last-cargo) does not appear in the input vessel data.
- **CII Grade D ignored:** vessel with `cii_grade='D'` recommended without `issues[]`
  flag — charterer-side rejection risk.
- **Score/level inconsistency:** `match_level='good'` but reasons cite ≥2 hard
  problems, or `match_level='weak'` with 3+ clean fits and no issues.
- **Empty match_reasons OR every reason without numbers:** breaks HARD RULE in
  the prompt that every reason cite ≥1 number.
- **Pre-filter feasible pair dropped:** input has N readiness pairs, output has
  fewer matches than input pairs without justification (matches MUST equal pairs
  per INCLUSION POLICY in prompt).
- **Readiness verdict ignored:** prompt says "use readiness verbatim" but match
  invents its own timing claim contradicting `readiness.verdict`.
- **Bunker math off by ≥30%** when LLM cites cost figure (vs class-default
  consumption × distance/speed × bunker $/mt).

## MEDIUM — noisy output, not workflow-blocking

- Bunker math off by 15-30%.
- `match_reasons` cite a number but with wrong unit (mt vs cbm, nm vs km).
- ETA assumes unrealistic speed (e.g., 16kn for handysize when class default 12.5).
- Laycan slack underestimated (says "tight" when readiness says "ideal").
- Geographic distance estimate off by ≥40% when both ports are in input.
- Duplicate match for same pair.

## LOW — cosmetic / annotation gaps

- Reasons readable but mention obvious facts already in `issues`.
- Number rounding inconsistent (3,600.00 vs ~3.6k).
- Issue phrasing vague but technically correct.
- Optional fields (e.g., commission notes) not surfaced.

---

## Calibration rules

- **Hard-filter bypass is always CRITICAL**, regardless of how clean the rest of the output looks. One CRITICAL = whole case FAILs.
- **Fabrication is always HIGH** — even if the fabricated number happens to be plausible.
- **Score/level/reasons must triangulate.** Gut check: would a broker be embarrassed to forward this to the principal? If yes → at least HIGH.
- **Schema gaps are NOT bugs.** If the matcher doesn't surface "voyage_economics" because the schema has no such field → log to schema-gaps.md, not as HIGH.
- **Design disagreements are NOT bugs.** If the matcher does X and design-decisions.md says X is intentional → not an issue.
