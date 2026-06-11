# Runbook: Post-deploy seed guard

## What it does

`scripts/ops/post-deploy-seed.sh` is an idempotent seed guard that runs after
deploy. It checks `COUNT(*)` for each required table and seeds it only if empty.

Tables guarded:

- `roi_metrics` — required for ROI guarantee feature (`ROI_GUARANTEE_ENABLED`)
- `fx_rates` — required for multi-currency display (`MULTI_CURRENCY_V2_ENABLED`)

Re-runs are safe: existing rows are never overwritten.

## Why the deploy workflow doesn't call it automatically

The SSH key on `outreach-vps` uses a forced command:

```
command="/root/deploy.sh $SSH_ORIGINAL_COMMAND"
```

`/root/deploy.sh` is a dispatcher that routes by service name:
`"quantika-demo <sha>"` → `/root/deploy-quantika-demo.sh <sha>`. Sending
`"bash /root/quantika-demo/scripts/ops/post-deploy-seed.sh"` passes `bash` as
the service name, which `deploy.sh` doesn't recognise → `ERROR: unknown service: bash`.

## Manual run (when needed)

SSH directly if you have a key that bypasses the forced command, or run from the VPS:

```bash
# From outreach-vps (root session):
cd /root/quantika-demo
bash scripts/ops/post-deploy-seed.sh
```

Or via SSH with a privileged key:

```bash
ssh -i ~/.ssh/your_admin_key root@185.249.225.169 \
  "cd /root/quantika-demo && bash scripts/ops/post-deploy-seed.sh"
```

## VPS integration

The deploy script already runs idempotent seed guards (roi_metrics, fx_rates)
and the served-DB migration after every successful deploy — no manual wiring
needed.

Since #940 the script IS tracked in the repository:
`ops/scripts/deploy-quantika-demo.sh` is the canonical source, and the
installed copy `/root/deploy-quantika-demo.sh` self-updates from `origin/main`
on every run. **Do not hand-edit it on the VPS** — any direct edit is silently
overwritten by the next deploy. Change it via PR instead.

## When to run manually

- After first deploy to a fresh VPS instance
- After a database reset or migration that drops `roi_metrics` or `fx_rates`
- When the ROI guarantee or multi-currency features show "no data" errors

For deeper post-deploy DB/env checks (schema version, fx_rates rows, required
env vars, health endpoints) run `bash scripts/ops/verify-deploy.sh` on the VPS.
