# Adversarial review + fix — war-risk premium

> EXECUTION MODE — read first. You are reviewing an implementer's work and FIXING any
> gaps yourself, right now, by editing the actual source files. Do NOT write a plan,
> design doc, or review report as your deliverable. Your work is judged ONLY on the
> resulting code diff. If the implementation is already correct, make minimal or no
> changes — do not rewrite working code or touch unrelated files.

An implementer just changed this repo to add live JWC war-risk rates + Suez-transit
detection. Review their diff (shown at the bottom) HARD against the three requirements
below. Where it falls short, FIX it by editing the source files. Add focused unit tests
if any requirement lacks coverage.

## Requirements to verify and fix

- **Д1 — live rate + fallback + provenance.** `lib/economics/war-risk.ts` must source the
  current JWC rate live from `data/knowledge/jwc/2025-current.yaml` (zone JWLA-033), keep a
  hardcoded fallback when the file/zone is missing or unreadable, and surface which source
  (live vs fallback) was used on the result.

- **Д2 — tolerant single-source loader.** A small, memoized, tolerant YAML loader (separate
  from the existing parser) that reads the JWC zones, maps zone IDs to the calculator's zone
  IDs, converts pct→fraction, and returns `null` on ANY error without throwing. It must NOT
  modify the existing YAML parser, schema, migrations, or the RAG path.

- **Д3 — Suez transit triggers HRA.** A voyage that TRANSITS the Suez canal must trigger the
  `red-sea-hra` premium EVEN IF neither endpoint is an HRA port. A voyage that does NOT transit
  Suez and has no HRA port must NOT get it. Verify both directions are handled and tested.

## Common gaps to check

- Fallback path silently throws instead of returning the hardcoded rate.
- Loader throws on malformed YAML instead of returning `null`.
- Suez transit detection only checks endpoints, missing the `viaCanal`/transit signal.
- Missing or shallow unit tests for the negative case (no transit, no HRA → no premium).

Fix the gaps now by editing files. The implementer's diff follows.
