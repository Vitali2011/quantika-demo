# Phase 4: Pre-Implementation Notes

## Execution Plan

### Wave 1
- Front 1: Foundation — directly in `projects/quantika-demo/`
- No worktree possible before git repo exists

### Wave 2 (after Front 1 completes and git repo exists)
- Create worktrees:
  - `worktrees/quantika-demo-auth` — Front 2: Auth + Gmail
  - `worktrees/quantika-demo-ai` — Front 3: AI Layer
  - `worktrees/quantika-demo-ops` — Front 5: Config + Deploy

### Wave 3 (after Fronts 2+3+5 merged)
- Front 4: UI Pages + Components — in main repo

## Overlap Verification
- F1: foundation files only (no overlap)
- F2: lib/google.ts, app/api/auth/, app/api/emails/ only
- F3: lib/openai.ts, lib/prompts.ts, app/api/ai/ only
- F4: app/ pages, components/feature/
- F5: README, ecosystem.config.js, docs/, ops/
- NO FILE OVERLAPS between any fronts
