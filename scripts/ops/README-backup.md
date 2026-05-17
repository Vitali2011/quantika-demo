# Quantika Backup

Post-incident backup system. Created after **INCIDENT-2026-05-17**: `.env.local`
was silently truncated to 35 bytes on 2026-05-16 10:55; production degraded for
22 hours undetected.

## What is backed up

| Priority | Path | Why |
|----------|------|-----|
| 1 | `/root/work/quantika-demo/.env.local` | All secrets — irrecoverable if lost |
| 2 | `/root/.config/gcp/quantika-vertex-ai.json` | GCP service-account creds |
| 3 | `/root/work/quantika-demo/data/quantika.db` | RAG corpus + distances |
| 4 | `/root/work/quantika-demo/data/sessions.db` | Session state |
| 5 | `/root/work/quantika-demo/uploads/` | User uploads (if directory exists) |

## Approach: local tar.gz with sha256

**Option B (borgbackup)** was the original recommendation but requires installing
an additional package (`apt install borgbackup`). The current implementation uses
`tar + sha256sum` — zero external deps, already available on any Debian/Ubuntu
system. Borgbackup can be layered on top later for deduplication if archive sizes
grow.

Storage: `/var/backups/quantika/`
```
/var/backups/quantika/
  daily/
    quantika-backup-YYYY-MM-DD.tar.gz
    quantika-backup-YYYY-MM-DD.tar.gz.sha256
  weekly/
    quantika-backup-YYYY-WXX.tar.gz
    quantika-backup-YYYY-WXX.tar.gz.sha256
```

Retention: **7 daily** + **4 weekly** (≈ 28 days total coverage)

## Quick start

```bash
# 1. Dry-run: verify sources exist and dirs are writable
./scripts/ops/backup.sh --dry-run

# 2. First real backup
./scripts/ops/backup.sh

# 3. Verify the backup can be restored
./scripts/ops/restore-test.sh

# 4. Install cron (run as root on VPS)
sudo cp scripts/ops/quantika-backup.cron /etc/cron.d/quantika-backup
sudo chmod 644 /etc/cron.d/quantika-backup
sudo chown root:root /etc/cron.d/quantika-backup
```

## Schedule

| Time (UTC) | Time (BY) | Job |
|------------|-----------|-----|
| 00:00 | 03:00 | `backup.sh` — create daily archive |
| 00:15 | 03:15 | `restore-test.sh` — verify latest archive |

Runs after `nightly-ci-watch` (02:00 BY) to avoid I/O contention.

## Monitoring / alerting

On success, `backup.sh` POSTs to `/api/admin/cron-heartbeat` with
`cron_name=quantika-backup`. If no heartbeat is seen for > 24 h, the monitoring
dashboard will flag it.

`backup.sh` reads `CRON_SECRET` and `NEXT_PUBLIC_APP_URL` automatically from
`.env.local` — no separate configuration needed.

The backup also pre-flight-checks `.env.local` size (aborts if < 100 bytes),
preventing a repeat of the 2026-05-17 incident pattern where a truncated file
was silently present.

## Restore procedure

```bash
# List available backups
ls -lh /var/backups/quantika/daily/

# Automated verify
BACKUP_DIR=/var/backups/quantika ./scripts/ops/restore-test.sh

# Manual restore to /tmp (inspect before overwriting live)
ARCHIVE=/var/backups/quantika/daily/quantika-backup-YYYY-MM-DD.tar.gz
mkdir /tmp/quantika-restore
tar -xzf "$ARCHIVE" -C /tmp/quantika-restore

# Inspect
ls /tmp/quantika-restore/root/work/quantika-demo/
cat /tmp/quantika-restore/root/work/quantika-demo/.env.local | wc -c

# If .env.local needs restoring (STOP APP FIRST)
pm2 stop quantika-demo
cp /tmp/quantika-restore/root/work/quantika-demo/.env.local \
   /root/work/quantika-demo/.env.local
pm2 restart quantika-demo --update-env
```

## Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_DIR` | `/root/work/quantika-demo` | App root |
| `BACKUP_DIR` | `/var/backups/quantika` | Backup storage root |
| `DAILY_KEEP` | `7` | Number of daily archives to retain |
| `WEEKLY_KEEP` | `4` | Number of weekly archives to retain |
| `CRON_SECRET` | from `.env.local` | For heartbeat POST auth |
| `APP_URL` | from `NEXT_PUBLIC_APP_URL` | Heartbeat target base URL |

## Logs

```bash
# Real-time
tail -f /var/log/quantika-backup.log

# Via systemd journal
journalctl -t quantika-backup -f

# Last run summary
grep -E "PASS|FAIL|complete|ERROR" /var/log/quantika-backup.log | tail -20
```
