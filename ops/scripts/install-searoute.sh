#!/usr/bin/env bash
# Install searoute service to /opt/searoute on VPS.
# Run as root from the repo root after deploy-vps.sh has synced the codebase.
# Does NOT enable or start the service — operator does that after validation.
#
# Usage:
#   sudo bash ops/scripts/install-searoute.sh
#
# Post-install:
#   sudo systemctl daemon-reload
#   curl http://127.0.0.1:8200/health   # smoke test
#   sudo systemctl enable --now searoute   # when ready

set -euo pipefail

SVCDIR=/opt/searoute
VENV="$SVCDIR/venv"
UNIT_SRC="ops/systemd/searoute.service"
UNIT_DST="/etc/systemd/system/searoute.service"
SRC="services/searoute"

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

echo "[searoute-install] Reloading systemd daemon"
systemctl daemon-reload

echo "[searoute-install] Done. To start:"
echo "  systemctl enable --now searoute"
echo "  curl http://127.0.0.1:8200/health"
