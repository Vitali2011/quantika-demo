total_gaps: 4
gaps:
  - category: testing
    question: "What jest.config format (mjs/ts/js) and transformer settings does this project need for TypeScript + Next.js + @/* path aliases?"
    target_files: [jest.config.mjs, jest.setup.ts, package.json]
    priority: critical

  - category: codebase-currency
    question: "architecture.md states 'Jest (минимально настроен)' but no jest.config.* file exists — is jest actually configured or is the analysis stale?"
    target_files: [.claude/analysis/architecture.md, jest.config.mjs]
    priority: critical

  - category: shared-types
    question: "What is the full shape of SessionData used in decomp-07 session tests? The type is referenced but not documented in any decomp."
    target_files: [lib/types.ts, lib/session.ts]
    priority: nice-to-have

  - category: optional-settings-guards
    question: "What is the build-time behavior of withSentryConfig() in next.config.mjs when @sentry/nextjs is not yet installed or SENTRY_DSN is absent? Will webpack fail?"
    target_files: [next.config.mjs, sentry.client.config.ts, package.json]
    priority: nice-to-have
