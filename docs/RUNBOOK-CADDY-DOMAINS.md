# Runbook — Adding a Domain to Caddy on VPS

Active Caddyfile: `/etc/caddy/Caddyfile` on `root@185.249.225.169`.
Per-domain blocks live in repo at `ops/Caddyfile.<domain>` and must be **manually
appended** to `/etc/caddy/Caddyfile` on the VPS — Caddy does NOT auto-import
these.

## Steps to add a new domain

```bash
ssh root@185.249.225.169
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
cat /root/quantika-demo/ops/Caddyfile.<domain> >> /etc/caddy/Caddyfile
systemctl reload caddy
systemctl is-active caddy   # must be 'active'
```

Wait ~30s for Let's Encrypt provisioning, then verify:

```bash
curl -sI https://<domain>/api/health   # expect HTTP/2 200
```

## Cloudflare prerequisites

- Cloudflare SSL mode must be **Full** (not Flexible, not Full-strict).
  Caddy auto-provisions a Let's Encrypt cert; CF "Full-strict" rejects only
  self-signed, so LE works either way — but **Full** is the documented setting.
- DNS A record points `<domain>` → VPS public IP `185.249.225.169`.

## Rollback

```bash
cp /etc/caddy/Caddyfile.bak.<timestamp> /etc/caddy/Caddyfile
systemctl reload caddy
```

## Why blocks aren't auto-imported

The active `/etc/caddy/Caddyfile` is hand-curated (e.g., `allegro.quantika.org`
includes `basic_auth` with env-var credentials that depend on
`/etc/systemd/system/caddy.service.d/auth.conf`). Auto-importing every
`ops/Caddyfile.*` would require unifying all secrets in systemd drop-ins.
Until that is done, this runbook is the source of truth.
