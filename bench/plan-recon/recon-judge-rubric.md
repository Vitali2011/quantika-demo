# Blind recon grading — root-cause match

A candidate did a read-only investigation of a known bug and produced a root-cause analysis.
You are given (a) the GOLD root cause and accept/symptom guidance, and (b) the candidate's
analysis. Decide how well the candidate identified the ROOT (not the symptom). You do NOT know
which model produced the candidate text. Grade strictly; do not reward length or unrelated detail.

## Scoring

- `root`: 2 = identified the actual root per the GOLD "ACCEPT as root-found" guidance.
  1 = symptom-only / adjacent (per the GOLD "SYMPTOM-ONLY" guidance) — correct area, wrong/no root.
  0 = wrong or no usable cause.
- `location`: 0 or 1 — 1 if it named a plausible correct file/function area, else 0.
- `confidence`: your confidence in this grade, 0..3 (3 = unambiguous).
- `notes`: ONE short sentence on the deciding factor.

## Output

Output ONLY a single JSON object on one line, nothing before or after:
{"root":N,"location":N,"confidence":N,"notes":"..."}
