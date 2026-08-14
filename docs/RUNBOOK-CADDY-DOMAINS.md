# Runbook — Publishing a Domain (Cloudflare Tunnel + Caddy)

**Traffic path (since 2026-08-14):**

```
visitor → Cloudflare edge → cloudflared (tunnel "quantika-prod")
        → Caddy on localhost:443 → app (localhost:3000 demo, localhost:8100 allegro)
```

The origin `185.249.225.169` accepts **no inbound web traffic**: `ufw` allows
port 22 only. Ports 80/443 are closed, so the site is reachable exclusively
through the tunnel. Direct-to-IP access (the old Cloudflare bypass) is gone.

Key files on the VPS:

| Path                                  | Purpose                                                |
| ------------------------------------- | ------------------------------------------------------ |
| `/etc/cloudflared/config.yml`         | Tunnel id, credentials file, ingress rules             |
| `/root/.cloudflared/<tunnel-id>.json` | Tunnel credentials (secret, never commit)              |
| `/etc/caddy/Caddyfile`                | `allegro.quantika.org` block + `import Caddyfile.demo` |
| `/etc/caddy/Caddyfile.demo`           | `demo.quantika.org` block                              |

Tunnel: `quantika-prod`, id `9f780626-d43c-4969-90fc-af94bffd67c6`.

**The VPS is the source of truth, not this repo.** Verified 2026-08-14: the live
`demo.quantika.org` block is `tls internal` + `encode gzip zstd` +
`header /api/* Cache-Control "no-store"` + a plain `reverse_proxy localhost:3000`.
Two repo files describe the same host — `ops/Caddyfile.demo.quantika.org` and
`ops/caddy/Caddyfile.demo` — and neither matches it: the latter also carries the
SSE fixes (compression exclusion, `flush_interval -1`) that were never applied on
the VPS. Copying either file over the live one changes behaviour; diff first.

## TLS

Caddy serves **`tls internal`** (Caddy's local CA) on both hosts and cloudflared
connects with `noTLSVerify: true`. Let's Encrypt is no longer used and cannot be
used: HTTP-01/TLS-ALPN validation needs inbound 80/443, which are closed. Never
remove `tls internal` from a site block — Caddy would start failing ACME renewals.

Public certificates are Cloudflare's (edge), so visitors are unaffected.

## Steps to publish a new domain

```bash
ssh root@185.249.225.169
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
```

1. Add a Caddy site block — `tls internal` is mandatory:

   ```caddyfile
   <domain> {
       tls internal
       reverse_proxy localhost:<port>
   }
   ```

   ```bash
   systemctl reload caddy && systemctl is-active caddy
   ```

2. Add an ingress rule to `/etc/cloudflared/config.yml`, **above** the catch-all
   `- service: http_status:404`:

   ```yaml
   - hostname: <domain>
     service: https://localhost:443
     originRequest:
       originServerName: <domain>
   ```

   ```bash
   cloudflared tunnel ingress validate   # must print OK
   ```

3. Point DNS at the tunnel (creates a proxied CNAME to
   `<tunnel-id>.cfargotunnel.com`; add `--overwrite-dns` to replace an existing
   A/CNAME record):

   ```bash
   cloudflared tunnel route dns quantika-prod <domain>
   ```

4. Apply and verify:

   ```bash
   systemctl restart cloudflared && systemctl is-active cloudflared
   curl -sI https://<domain>/   # expect HTTP/2 200
   ```

## Cloudflare zone settings (already applied)

| Setting                 | Value                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| SSL/TLS encryption mode | Full (strict)                                                                             |
| Always Use HTTPS        | On                                                                                        |
| HSTS                    | On, max-age 6 months, no includeSubDomains, no preload                                    |
| Managed transforms      | "Add security headers", "Remove X-Powered-By"                                             |
| Rate limiting rule      | `login-brute-force` — 10 POSTs / 10s per IP on `demo.quantika.org/api/auth/login` → Block |
| Zero Trust Access       | `allegro.quantika.org` — policy `two-emails`, one-time PIN login                          |

`includeSubDomains` is deliberately off: a subdomain without HTTPS would become
unreachable for the whole max-age window.

## Rollback

```bash
cp /etc/caddy/Caddyfile.bak.<timestamp> /etc/caddy/Caddyfile
systemctl reload caddy
# tunnel-level rollback: restore the previous ingress block, then
systemctl restart cloudflared
```

Reopening the origin to the internet (`ufw allow 80,443/tcp`) is **not** a
rollback — it re-creates the bypass this setup removed.

## Prerequisites for the tunnel to work

- Outbound TCP/UDP to `*.argotunnel.com:7844` must stay open (checked on setup).
- `cloudflared.service` must be enabled; if it dies, both hosts go down —
  `systemctl status cloudflared` is the first thing to check on an outage.
