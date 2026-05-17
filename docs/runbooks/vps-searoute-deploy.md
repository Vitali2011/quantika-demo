# VPS Searoute Deploy Runbook

**Target host:** dev-VPS (157.173.124.116)
**Service port:** 8200 (internal only — Next.js on same host calls localhost:8200)
**Systemd unit:** `searoute.service`
**Service directory:** `/opt/searoute`
**Python venv:** `/opt/searoute/venv`
**Phase 1 dependency:** Block D (distances)

---

## Overview

`searoute` is a lightweight FastAPI service wrapping [searoute-py](https://github.com/genthalili/searoute-py).
It exposes a `/distance` endpoint returning sea-route distance in nautical miles between two lat/lon coordinates.

The Next.js app (`:8100`) calls this service server-side when `KNOWLEDGE_LAYER_DISTANCES_ENABLED=true`.
Port 8200 never needs to be publicly reachable.

Source in repo: `services/searoute/`
Systemd unit in repo: `ops/systemd/searoute.service`
Install helper: `ops/scripts/install-searoute.sh`

---

## Quick Install (recommended)

Run from the repo root on the VPS **as root**:

```bash
sudo bash ops/scripts/install-searoute.sh
```

This copies `main.py` + `requirements.txt` to `/opt/searoute/`, creates a venv, installs deps,
and drops the unit file at `/etc/systemd/system/searoute.service`. Does **not** enable the service.

After smoke testing (see Step 6), enable:

```bash
sudo systemctl enable --now searoute
```

---

## Manual Steps

### Step 1: Prerequisites

```bash
python3 --version   # 3.11+ preferred
sudo whoami         # should be root
systemctl --version
```

### Step 2: Create service directory and venv

```bash
mkdir -p /opt/searoute
cp services/searoute/main.py services/searoute/requirements.txt /opt/searoute/

python3.11 -m venv /opt/searoute/venv  # or python3 if 3.11 not symlinked
/opt/searoute/venv/bin/pip install -q -r /opt/searoute/requirements.txt
```

### Step 3: Install systemd unit

```bash
cp ops/systemd/searoute.service /etc/systemd/system/searoute.service
systemctl daemon-reload
```

Unit content for reference:
```ini
[Unit]
Description=Quantika Searoute Service
After=network.target

[Service]
WorkingDirectory=/opt/searoute
ExecStart=/opt/searoute/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8200
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Step 4: Firewall

Port 8200 must be reachable only from localhost:

```bash
ufw deny 8200/tcp
ufw reload
ufw status | grep 8200
```

### Step 5: Start service

```bash
systemctl enable --now searoute
systemctl status searoute
```

Expected: `Active: active (running)`.

### Step 6: Smoke test

```bash
# Health check
curl -s http://localhost:8200/health
# Expected: {"status":"ok","version":"1.0.0"}

# Distance: Singapore → Rotterdam (Suez)
curl -s -X POST http://localhost:8200/distance \
  -H 'Content-Type: application/json' \
  -d '{"origin_lat":1.29,"origin_lon":103.85,"dest_lat":51.92,"dest_lon":4.48,"route_via":"suez"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('distance_nm:', d['distance_nm'])"
# Expected: distance_nm ~ 8300 nm
```

---

## Seed port_distances table

Once the service is running, seed ~60K rows (200 ports × 3 routes):

```bash
# From the Next.js app root on VPS:
npx tsx scripts/knowledge/sources/distances.ts
```

Progress logs every 60s. ETA ~2-3h (network-bound). Idempotent — safe to re-run.

---

## Logs and monitoring

```bash
journalctl -u searoute -f              # live
journalctl -u searoute -n 100          # last 100 lines
journalctl -u searoute -p err          # errors only
```

---

## Rollback

Disable distance auto-resolution without touching the Python service:

```bash
# In /root/work/quantika-demo/.env.local on VPS:
KNOWLEDGE_LAYER_DISTANCES_ENABLED=false

pm2 restart quantika-demo   # picks up new env
```

To also stop the searoute service:

```bash
systemctl stop searoute
systemctl disable searoute
```

Re-enable after fixing:

```bash
systemctl enable --now searoute
# Then set KNOWLEDGE_LAYER_DISTANCES_ENABLED=true and restart quantika-demo
```
