# Wave α Smoke E2E Tests

Post-deploy health + feature checks. Runs in ~90 seconds.

## Run locally (auto-starts `npm run dev`)

```bash
npm run test:smoke
```

## Run against production (Tier 1 only — safe, read-only)

```bash
npm run test:smoke:prod
```

## Run only Tier 1 locally

```bash
npm run test:smoke:tier1
```

## Debug failures

```bash
npx playwright show-report playwright-report
```

## Tiers

| Tier | File | What it checks |
|------|------|----------------|
| 1 | `tier1-health.spec.ts` | `/api/health`, homepage load, `/onboarding` selectors, WhatsApp webhook security, lang/dir |
| 2 | `tier2-onboarding-flow.spec.ts` | Onboarding UI renders; region pick → session bootstrap → redirect → trial banner |
| 2 | `tier2-match-detail.spec.ts` | Dashboard without 5xx; match tabs + confidence border (skips if no matches in demo) |
| 2 | `tier2-api-checks.spec.ts` | `/api/market/benchmark`, `/api/audit`, `/api/economics` all non-404 |

Tier 2 match tests skip when demo data has no matches yet. This is expected on a fresh session.

## Full E2E (skeptical audit)

The full `skeptical-forwarder.spec.ts` tests domain correctness with 50 real email samples.
It takes 3+ minutes and requires the LLM pipeline. Run via `npm run test:e2e`.
