# OPS-02: Cloudflare 525 диагностика

## State as of 2026-05-02

Публичный URL `https://demo.quantika.org` отвечает HTTP/2 200.
Cert валидный Let's Encrypt (issuer E7, ALPN h2/http3).
DNS: Cloudflare proxy → 188.114.96.x / 97.x.

## Если 525 вернётся

Проверяй последовательно:

1. `caddy logs --since 30m | grep -i error`
2. `openssl s_client -connect localhost:443 -servername demo.quantika.org < /dev/null`
3. `dig +short demo.quantika.org` (должен показывать CF IPs 188.114.x.x)
4. Cloudflare dashboard → SSL/TLS mode (Full vs Full Strict)
5. Verify port 80 forwarding (для ACME http-01 challenge)

## Известные причины 525

- **ACME challenge fail** — Cloudflare проксирует :80, нужно DNS-01 challenge либо `tls internal`
- **Full Strict с self-signed cert** — Caddy должен получить Let's Encrypt (не self-signed)
- **DNS CNAME на старый IP** — проверить через `dig +short` что A-записи CF proxy

## Committed config

`ops/caddy/Caddyfile.demo` — актуальный Caddy config для demo.quantika.org.
`ops/caddy/install-caddy-config.sh` — idempotent install-скрипт.
