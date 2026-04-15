category: db-schemas
status: NOT_FOUND
findings:
  - question: "Does the project use any database or ORM?"
    answer: "NOT_FOUND — architecture.md states БД: Отсутствует. No SQL files, migration files, ORM config, or DB dependencies found."
    source: "architecture.md:12"

  - question: "What is the current session storage schema?"
    answer: "INFERRED: In-memory Map<string, SessionData>. SessionData shape (lib/types.ts:268-283): id, accessToken, createdAt, emails, classifications, processedEmails, parsedCargos, parsedVessels, parsedFixtureRecaps, matches, recaps, commissionSummary, counterparties, isSampleData?"
    source: "lib/types.ts:268-283 | lib/session.ts:5"

  - question: "Is SQLite session schema planned (spec-004)?"
    answer: "NOT_FOUND in source. Planned: lib/session-store.ts, better-sqlite3 dep, data/sessions.db — none exist yet."
    source: ".claude/audit/proposed_wave_plan.yaml:77-88"

  - question: "Are there db-schemas gap questions in gaps.md?"
    answer: "NOT_FOUND — no db-schemas category in gaps.md. Categories present: testing, codebase-currency, shared-types, optional-settings-guards."
    source: ".claude/analysis/gaps.md:1-22"

  - question: "Domain entity types that would map to DB tables?"
    answer: "INFERRED: Email, Classification, ProcessedEmail, ParsedCargo, ParsedVessel, ParsedFixtureRecap, Match, Recap, CommissionResult, CommissionSummary, Counterparty, RecapPoint, FreightRateRecord, SubjectItem"
    source: "lib/types.ts:25-373"
