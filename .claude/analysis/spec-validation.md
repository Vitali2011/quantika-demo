status: FAIL

errors:
  - spec: spec-05 + spec-07
    issue: "OVERLAP — jest.config.mjs and jest.setup.ts in Files in Scope of both (D5 batch). Split ownership: spec-09/spec-10 FORBIDDEN reference spec-05; spec-11/spec-12/spec-13 FORBIDDEN reference spec-07."
    fix_suggestion: "Assign both files to spec-07 only. Remove from spec-05 scope; add to spec-05 FORBIDDEN as managed by spec-07."

  - spec: spec-05 + spec-08
    issue: "OVERLAP — lib/__tests__/parsing-utils.test.ts in Files in Scope of both (D5 batch)."
    fix_suggestion: "spec-08 is authoritative. Remove from spec-05 scope; add to spec-05 FORBIDDEN as managed by spec-08."

  - spec: spec-05 + spec-09
    issue: "OVERLAP — app/api/ai/__tests__/classify.test.ts in Files in Scope of both (D5 batch)."
    fix_suggestion: "spec-09 is authoritative. Remove from spec-05 scope; add to spec-05 FORBIDDEN as managed by spec-09."

  - spec: spec-05 + spec-10
    issue: "OVERLAP — app/api/ai/__tests__/parse-cargo.test.ts in Files in Scope of both (D5 batch). spec-10 acknowledges being authoritative owner but scope conflict remains."
    fix_suggestion: "Remove from spec-05 scope; add to spec-05 FORBIDDEN as managed by spec-10."

  - spec: spec-02 + spec-08
    issue: "OVERLAP — app/api/ai/parse-cargo/route.ts, parse-vessel/route.ts, parse-recap/route.ts in Files in Scope of both (D5 batch). Both claim modify rights simultaneously."
    fix_suggestion: "Add parse-*/route.ts to spec-08 FORBIDDEN as managed by spec-02. Merge spec-02 first, then spec-08 applies refactor."

  - spec: spec-02 + spec-12
    issue: "OVERLAP — app/api/auth/google/route.ts in Files in Scope of both (D5 batch)."
    fix_suggestion: "Add to spec-12 FORBIDDEN as managed by spec-02; merge spec-02 first."

  - spec: spec-11 + spec-14
    issue: "OVERLAP — app/api/health/__tests__/health.test.ts in Files in Scope of both (D5 batch). spec-11 Requirements includes test creation; spec-14 is the dedicated test spec for the same file."
    fix_suggestion: "Remove test file from spec-11 scope; add to spec-11 FORBIDDEN as managed by spec-14."

  - spec: spec-03 + spec-13
    issue: "OVERLAP — next.config.mjs in Files in Scope of both (D5 batch). spec-13 Dependencies acknowledges sequential order but both still claim ownership."
    fix_suggestion: "Add next.config.mjs to spec-13 FORBIDDEN as managed by spec-03. spec-13 changes documented as follow-on patch after spec-03."

  - spec: spec-01 + spec-06
    issue: "OVERLAP (Batch 1) — package.json in Files in Scope of both. Prose note in spec-01 acknowledges this but FORBIDDEN table does not reflect it."
    fix_suggestion: "Add package.json to spec-01 FORBIDDEN as managed by spec-06."

  - spec: spec-07 + spec-12 + spec-13
    issue: "OVERLAP (D5 batch) — package.json in Files in Scope of all three specs simultaneously."
    fix_suggestion: "Designate one spec (e.g. spec-13) as package.json owner for D5. spec-07 and spec-12 list it in FORBIDDEN with notes for required additions."

  - spec: spec-13
    issue: "DEPENDENCY CONSISTENCY — FORBIDDEN claims lib/logger.ts is created by spec-13 but lib/logger.ts is in spec-12 Files in Scope; spec-13 does not list lib/logger.ts in its own Files in Scope."
    fix_suggestion: "Change spec-13 FORBIDDEN entry to: lib/logger.ts — managed by spec-12 (pino logger)."

warnings:
  - spec: spec-04
    issue: "GENERIC AC — Successful PR gets a green checkmark in GitHub is not locally testable; depends on external GitHub Actions runtime."

  - spec: spec-13
    issue: "GENERIC AC — application starts and works correctly contains vague works correctly. Should specify which behaviors are verified when SENTRY_DSN is unset."

  - spec: spec-09
    issue: "FORBIDDEN reference error — classify/route.ts attributed to spec-11 (health endpoint spec) but spec-11 does not manage that file. Should reference spec-02."

  - spec: spec-12
    issue: "FORBIDDEN reference error — classify/route.ts attributed to spec-09, but spec-09 only creates a test file. Route ownership belongs to spec-02."

  - spec: spec-01 + spec-06
    issue: "Batch label inconsistency — spec-01 labeled Batch 1 and spec-06 labeled Batch 1 (Волна 1) while residing in the D5 specs directory. May cause ordering confusion in parallel execution planning."
