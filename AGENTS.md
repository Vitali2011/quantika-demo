# Quantika Demo repository guidance

## Project facts

- Node.js 22, Next.js 16, and React 19. Read `CONTEXT.md` before domain work and
  use its canonical freight terminology in code and tests.
- Verify APIs introduced or changed after Next.js 14 or React 18 against current
  official Next.js or React documentation before implementation.
- Add a short ADR under `docs/adr/` only for a new provider, database, engine, or
  another hard-to-reverse architectural decision.

## Boundaries

- Work only in the assigned worktree and keep the diff limited to the requested goal.
- Do not read or modify secret-bearing `.env` files, credentials, production data,
  deployment state, or access settings unless the task explicitly authorizes it.
- Production changes go through a PR and the canonical deploy workflow; do not patch
  the VPS manually.
- Do not run browser or production QA automatically. Use it only when explicitly
  requested; ordinary changes use focused code-level verification.
- Before changing guarded modules, read the matching rule:
  - `lib/ai-provider.ts`: `.claude/rules/ai-provider.md`
  - retriever modules: `.claude/rules/retriever.md`
  - admin API or middleware: `.claude/rules/admin-api.md`

## Verification

- Start with the narrowest relevant Jest target, then run `npm run lint` for the
  affected change.
- Run `npm run build` once when routes, server/client boundaries, config, or bundling
  may be affected; rely on exact-SHA CI for the final integration gate.
- Run Playwright or production smoke scripts only with explicit task authority.
- Done means focused tests pass, lint/build checks required by the change pass,
  `git diff --check` is clean, and the final report names exact commands and limits.
