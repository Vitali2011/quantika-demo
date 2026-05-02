#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-/root/quantika-demo}"

echo "==> Installing Caddy config from ${REPO_ROOT}/ops/caddy/Caddyfile.demo ..."

install -m 0644 -D "${REPO_ROOT}/ops/caddy/Caddyfile.demo" /etc/caddy/Caddyfile.demo

if ! grep -q '^import /etc/caddy/Caddyfile.demo$' /etc/caddy/Caddyfile; then
    echo "import /etc/caddy/Caddyfile.demo" >> /etc/caddy/Caddyfile
    echo "==> Added import line to /etc/caddy/Caddyfile"
else
    echo "==> Import line already present in /etc/caddy/Caddyfile"
fi

caddy validate --config /etc/caddy/Caddyfile

systemctl reload caddy

echo "✓ Caddy config installed and reloaded"

exit 0
