aspect: architecture
findings_count: 8
findings:
  - file: app/api/ai/classify/route.ts
    line: 37
    severity: high
    finding: >
      Significant business logic embedded in route handler: thread grouping, reply detection,
      status derivation (NEEDS_ACTION/PENDING/RESPONDED/INFO_ONLY), and freshness calculation
      are all performed inline inside the POST handler (lines 37–102). This is domain logic,
      not HTTP coordination.
    recommendation: >
      Extract classification post-processing into a lib/classification-service.ts function
      (e.g. `buildProcessedEmails(emails, aiClassifications)`). Route handler should only
      call the function and write to session.
    roadmap_candidate: yes

  - file: lib/session.ts
    line: 5
    severity: high
    finding: >
      All application state is stored in a global in-memory Map<string, SessionData> with
      no data access abstraction. This couples every feature to a single-process,
      non-persistent store. Horizontal scaling, restart recovery, or a future DB migration
      have no seam to hook into.
    recommendation: >
      Introduce a thin session repository interface (getSession/updateSession/deleteSession)
      so the current Map implementation can be swapped. Even a minimal interface isolates
      callers from the storage backend.
    roadmap_candidate: yes

  - file: app/dashboard/page.tsx
    line: 171
    severity: medium
    finding: >
      Data transformation logic (buildRows, groupByStatus, contact aggregation with senderMap)
      is defined inline in a Next.js Server Component page. These are pure data operations
      with no UI dependency and should live in lib/.
    recommendation: >
      Move buildRows, groupByStatus, and contact-aggregation logic to lib/dashboard-helpers.ts
      (or similar). Pages should call helpers, not define them.
    roadmap_candidate: yes

  - file: app/processing/page.tsx
    line: 20
    severity: medium
    finding: >
      The entire processing pipeline orchestration (STEP_GROUPS, parallel/sequential execution,
      error propagation, critical-step stopping) lives in a client-side React component.
      Pipeline topology is business logic, not UI logic.
    recommendation: >
      Extract STEP_GROUPS and pipeline execution logic to a lib/pipeline.ts module. The
      component should import a pipeline definition, not define it. This also makes the
      pipeline independently testable.
    roadmap_candidate: yes

  - file: app/api/
    line: 1
    severity: medium
    finding: >
      No API versioning. All routes are mounted at /api/ai/* and /api/* with no version
      prefix. Any breaking change to request/response shape will silently break existing
      clients. The processing page hard-codes endpoint paths like '/api/ai/classify'.
    recommendation: >
      Add a version prefix (/api/v1/...). Next.js App Router supports this via folder
      nesting. Update processing/page.tsx STEP_GROUPS endpoints accordingly.
    roadmap_candidate: yes

  - file: app/api/ai/
    line: 1
    severity: medium
    finding: >
      Inconsistent API endpoint naming conventions. Some endpoints use a verb-noun pattern
      (parse-cargo, parse-vessel, parse-recap, draft-quote, draft-reply), others use a
      noun-only pattern (classify, match, recap, counterparty). 'recap' is ambiguous —
      it refers to negotiation recap, while 'parse-recap' refers to fixture recap parsing.
    recommendation: >
      Adopt a consistent REST-style naming: POST /api/v1/emails/classify,
      POST /api/v1/cargo/parse, POST /api/v1/vessels/parse, POST /api/v1/fixtures/parse,
      POST /api/v1/matches/generate, etc.
    roadmap_candidate: no

  - file: app/api/ai/parse-cargo/route.ts
    line: 11
    severity: low
    finding: >
      The toConfidence<T>() helper function is duplicated identically in
      app/api/ai/parse-cargo/route.ts (line 11) and app/api/ai/parse-recap/route.ts
      (line 13). This is a shared transformation utility defined in two places.
    recommendation: >
      Move toConfidence to lib/utils.ts or a new lib/ai-helpers.ts and import from there.
    roadmap_candidate: no

  - file: app/api/ai/parse-recap/route.ts
    line: 102
    severity: low
    finding: >
      Debug console.log statements left in production route handler (line 102):
      logs commissionPercent and freightRate arrays on every request.
    recommendation: Remove the console.log statements before production use.
    roadmap_candidate: no
