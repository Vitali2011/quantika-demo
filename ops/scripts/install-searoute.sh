#!/usr/bin/env bash
# Install searoute service to /opt/searoute on VPS.
# Run as root from the repo root after deploy-vps.sh has synced the codebase.
# Does NOT enable or start the service — operator does that after validation.
#
# Usage:
#   sudo bash ops/scripts/install-searoute.sh
#
# Post-install:
#   curl http://127.0.0.1:8200/health   # smoke test
#   sudo systemctl enable --now searoute   # when ready

set -euo pipefail

if [[ ! -f "services/searoute/main.py" ]]; then
  echo "[searoute-install] ERROR: Must be run from the repo root (services/searoute/main.py not found)" >&2
  exit 1
fi

SVCDIR=/opt/searoute
VENV="$SVCDIR/venv"
UNIT_SRC="ops/systemd/searoute.service"
UNIT_DST="/etc/systemd/system/searoute.service"
SRC="services/searoute"

echo "[searoute-install] Stopping old quantika-searoute service if running"
systemctl stop quantika-searoute.service 2>/dev/null || true
systemctl disable quantika-searoute.service 2>/dev/null || true

echo "[searoute-install] Creating searoute system user"
useradd --system --no-create-home --shell /usr/sbin/nologin searoute 2>/dev/null || true

echo "[searoute-install] Creating $SVCDIR"
mkdir -p "$SVCDIR"

echo "[searoute-install] Copying service files from $SRC → $SVCDIR"
cp "$SRC/main.py" "$SRC/requirements.txt" "$SVCDIR/"

echo "[searoute-install] Creating venv at $VENV"
python3.11 -m venv "$VENV" 2>/dev/null || python3 -m venv "$VENV"

echo "[searoute-install] Installing Python dependencies"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$SVCDIR/requirements.txt"

echo "[searoute-install] Installing systemd unit → $UNIT_DST"
cp "$UNIT_SRC" "$UNIT_DST"
chown -R searoute:searoute "$SVCDIR"

echo "[searoute-install] Reloading systemd daemon"
systemctl daemon-reload

echo "[searoute-install] Done. To start:"
echo "  systemctl enable --now searoute"
echo "  curl http://127.0.0.1:8200/health"
