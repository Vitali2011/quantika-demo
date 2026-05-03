#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-/root/quantika-demo}"
SRC="${REPO_ROOT}/ops/caddy/Caddyfile.demo"
DST="/etc/caddy/Caddyfile.demo"
MAIN="/etc/caddy/Caddyfile"

echo "==> Installing Caddy config from ${SRC} ..."

# Validate our segment in isolation (the main Caddyfile uses env vars from a
# systemd drop-in for unrelated sites — running `caddy validate` against it
# without those env vars would fail spuriously).
caddy validate --adapter caddyfile --config "${SRC}"

# Backup current target so we can roll back if reload misbehaves.
if [ -f "${DST}" ]; then
    cp -p "${DST}" "${DST}.bak"
fi

install -m 0644 -D "${SRC}" "${DST}"

if ! grep -q "^import ${DST}\$" "${MAIN}"; then
    echo "import ${DST}" >> "${MAIN}"
    echo "==> Added import line to ${MAIN}"
else
    echo "==> Import line already present in ${MAIN}"
fi

# Reload via systemctl (preserves the unit's Environment= drop-in for env vars
# referenced elsewhere in the main Caddyfile). On failure, restore backup.
if ! systemctl reload caddy; then
    echo "✗ caddy reload failed — restoring previous ${DST}" >&2
    if [ -f "${DST}.bak" ]; then
        mv "${DST}.bak" "${DST}"
        systemctl reload caddy || true
    fi
    exit 1
fi

# Sanity check: confirm demo.quantika.org block is actually loaded after reload.
# Catches the case where the import line vanishes from the main Caddyfile
# (observed once 2026-05-03 — root cause unknown).
if ! caddy adapt --config "${MAIN}" --adapter caddyfile 2>/dev/null | grep -q '"demo\.quantika\.org"'; then
    echo "✗ post-reload sanity: demo.quantika.org block NOT in adapted config — restoring backup" >&2
    if [ -f "${DST}.bak" ]; then
        mv "${DST}.bak" "${DST}"
        systemctl reload caddy || true
    fi
    # Re-add import line if it disappeared from MAIN
    if ! grep -q "^import ${DST}\$" "${MAIN}"; then
        echo "import ${DST}" >> "${MAIN}"
        systemctl reload caddy || true
    fi
    exit 1
fi

# Sanity check passed — safe to drop the backup.
rm -f "${DST}.bak"

echo "✓ Caddy config installed and reloaded"
