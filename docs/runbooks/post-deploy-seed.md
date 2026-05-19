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

## VPS integration — action required

To run the seed automatically after each deploy, inline the seed call inside
`/root/deploy-quantika-demo.sh` on `outreach-vps`, after the health check and
before the final `exit 0`:

```bash
# --- add after health check ---
echo "[deploy] Running post-deploy seed guard..."
(cd /root/quantika-demo && bash scripts/ops/post-deploy-seed.sh) \
  || echo "[deploy] WARN: seed guard failed — check manually"
```

This edit must be made **directly on the VPS** — `/root/deploy-quantika-demo.sh`
is not tracked in the repository.

## When to run manually

- After first deploy to a fresh VPS instance
- After a database reset or migration that drops `roi_metrics` or `fx_rates`
- When the ROI guarantee or multi-currency features show "no data" errors
