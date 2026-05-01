# Wave β cron jobs

## β-10 — subs deadline guardian

Cron entry: `npx tsx scripts/check-deadlines.ts`

Frequency: every 30 minutes.

Crontab snippet (deploy on production host):

```
*/30 * * * * cd /var/app/quantika-demo && npx tsx scripts/check-deadlines.ts >> /var/log/quantika/check-deadlines.log 2>&1
```

Flags:

- `--dry-run` — log scan only, no notifications dispatched.
- `--demo` — load `lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json` and process it (used for e2e demo runs).

Idempotency: the script relies on `notifiedStages` persisted per deal. Re-running within the same stage is a no-op.
