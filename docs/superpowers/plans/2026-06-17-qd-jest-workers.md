# Plan — Speed up CI Test job via jest `--maxWorkers=2`

Date: 2026-06-17
Branch: `qd-jest-workers`
Type: CI performance experiment (orchestrator merges only if real CI is faster)

## Root cause

CI `Test` job runs ~5m41s. Breakdown:

- `npm test` (bare `jest`) = ~310s (91% of job)
- `npm ci` = ~0s (node_modules cache hit)
- `npm run test:regression` = ~8s

`jest.config.mjs` sets **no** `maxWorkers`, and the `test` package script is bare
`jest`. GitHub's `ubuntu-latest` runner has **2 cores**. jest's default worker
count is `cores - 1` = **1 worker** → the suite runs effectively serial, using
only half the runner.

## Lever

Use both runner cores: pass `--maxWorkers=2` to the CI `npm test` invocation.

## Change (one line, CI-only)

`.github/workflows/ci.yml`, `test` job:

```diff
-      - run: npm test
+      - run: npm test -- --maxWorkers=2
```

- **CI-only.** Do NOT edit `package.json` `test` script — bare `jest` keeps
  jest's adaptive default locally (devs with more cores aren't capped at 2).
- `test:regression` left unchanged.
- `jest.config.mjs` untouched (no `maxWorkers` baked in) unless a race fix
  genuinely requires per-worker isolation.
- No job renamed (`Test` / `TypeCheck + Audit` / `Build` are required checks).

## Parallel-safety verification (dev-vps, foreground/blocking)

1->2 workers can surface shared-state races (sqlite/test DB, ports, global
mocks/singletons, fixture paths, ordering). Verify at 2-worker concurrency:

1. `npm test -- --maxWorkers=2 --forceExit` — **run 1**, must be GREEN
2. `npm test -- --maxWorkers=2 --forceExit` — **run 2** (consecutive), must be GREEN
3. `npm run test:regression` — once, must be GREEN

(`--forceExit` is a LOCAL-only safety wrapper: dev-vps jest hangs on open
handles after the run completes — known behavior. It forces process exit AFTER
tests finish, so it does not mask races, which manifest as failures *during*
execution. CI's bare jest already exits cleanly in ~310s, so the CI line does
not need it.)

dev-vps has 6 cores → `--maxWorkers=2` here is for **race detection at 2-worker
concurrency**, NOT a timing measurement. The timing verdict is the **real CI
run** (orchestrator validates after merge-candidate CI).

Any race found → fix PROPERLY: per-worker isolation keyed on
`process.env.JEST_WORKER_ID` (unique temp dir / sqlite per worker) or proper
mock reset. Never edit test expectations to fit impl; never skip/mask a race.

## Gates

- `npm run lint` — pass
- `npx tsc --noEmit` — pass
- 2x green under `--maxWorkers=2` + test:regression green

## Out of scope

- package.json `test` script (local dev speed).
- Sharding the Test job via matrix (`jest --shard`) — premature at this scale.
- typecheck/build/node-version/caches; any job rename.
