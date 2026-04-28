# DB Backup & Restore Runbook

SQLite database (`data/sessions.db`) is backed up nightly to Cloudflare R2.

## Infrastructure

| Component | Location |
|-----------|----------|
| Backup script | `/root/scripts/backup-quantika.sh` (VPS) |
| Credentials env | `/root/.r2-env` (chmod 600, VPS) |
| Crontab schedule | `0 3 * * *` (03:00 UTC = 06:00 MSK / 05:00 Berlin) |
| Log file | `/var/log/quantika-backup.log` |
| R2 bucket | `quantika-backups/daily/` |
| Retention | 30 days (enforced by script: `rclone delete --min-age 30d`) |

## Verify Latest Backup

```bash
ssh root@185.249.225.169
source /root/.r2-env
rclone --s3-provider Cloudflare \
  --s3-endpoint "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --s3-access-key-id "$R2_ACCESS_KEY_ID" \
  --s3-secret-access-key "$R2_SECRET_ACCESS_KEY" \
  ls ":s3:${R2_BUCKET}/daily/" | sort | tail -5
```

## Check Backup Logs

```bash
ssh root@185.249.225.169 'tail -20 /var/log/quantika-backup.log'
```

Expected output: `[2026-...T...] backup ok: quantika-YYYYMMDD-HHMMSS.db.gz`

## Run Manual Backup

```bash
ssh root@185.249.225.169 '/root/scripts/backup-quantika.sh'
```

## Restore Database

### On existing VPS

```bash
ssh root@185.249.225.169

source /root/.r2-env

# List available backups
rclone --s3-provider Cloudflare \
  --s3-endpoint "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --s3-access-key-id "$R2_ACCESS_KEY_ID" \
  --s3-secret-access-key "$R2_SECRET_ACCESS_KEY" \
  ls ":s3:${R2_BUCKET}/daily/"

# Download chosen backup
BACKUP="quantika-YYYYMMDD-HHMMSS.db.gz"
rclone --s3-provider Cloudflare \
  --s3-endpoint "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --s3-access-key-id "$R2_ACCESS_KEY_ID" \
  --s3-secret-access-key "$R2_SECRET_ACCESS_KEY" \
  copy ":s3:${R2_BUCKET}/daily/$BACKUP" /tmp/

# Restore
gunzip "/tmp/$BACKUP"
DB_PATH=$(find /root/quantika-demo -name "sessions.db" -type f | head -1)
cp "$DB_PATH" "${DB_PATH}.bak-$(date +%Y%m%d)"   # keep current as safety
cp "/tmp/${BACKUP%.gz}" "$DB_PATH"
/root/.npm-global/bin/pm2 restart quantika-demo
```

### On a new VPS (disaster recovery)

1. Install Node.js, pm2, sqlite3 on new VPS
2. Clone repo: `git clone git@github.com:Vitali2011/quantika-demo.git /root/quantika-demo`
3. Copy `.env.local` from secure storage
4. Install rclone: `curl https://rclone.org/install.sh | bash`
5. Recreate `/root/.r2-env` with credentials (see section below)
6. Download and restore latest backup (follow steps above)
7. Start app: `pm2 start /root/quantika-demo/ecosystem.config.js`

## Rotate R2 Credentials

1. Cloudflare dashboard → R2 → Manage R2 API Tokens
2. Create new token with same permissions (Object Read & Write, bucket: `quantika-backups`)
3. SSH to VPS, update `/root/.r2-env` with new values
4. Test: `/root/scripts/backup-quantika.sh`
5. Revoke old token in Cloudflare dashboard
