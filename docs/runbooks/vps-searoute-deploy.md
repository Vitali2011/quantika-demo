# VPS Searoute Deploy Runbook

**Target host:** outreach-vps (185.249.225.169)
**Service port:** 8200 (internal only)
**Phase 1 dependency:** Block D (distances)
**Last verified:** 2026-05-06 (document only — not yet executed on VPS)

---

## Overview

`quantika-searoute` is a lightweight FastAPI service wrapping the [searoute-py](https://github.com/genthalili/searoute-py) library. It exposes a `/distance` endpoint that returns sea-route distance in nautical miles between two lat/lon coordinates, plus the GeoJSON geometry of the route.

The Next.js app (running on `:8100` on the same host) calls this service from `lib/knowledge/distances/*` when `KNOWLEDGE_LAYER_DISTANCES_ENABLED=true`. Requests are made server-side (Node → localhost:8200), so the port never needs to be publicly reachable.

Service path on disk: `/opt/quantika/services/searoute`
Canonical systemd unit: `ops/systemd/quantika-searoute.service` (already committed in repo)

---

## Prerequisites

Before starting, verify on the VPS:

```bash
# Python 3.11 or newer
python3.11 --version

# sudo access
sudo whoami   # should return root

# ufw is installed and active
sudo ufw status

# systemd is running
systemctl --version

# Free RAM >= 512 MB
free -m | awk '/^Mem/ { print $4 " MB free" }'
```

---

## Step 1: Install Python 3.11 + venv

```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev
python3.11 --version   # verify
```

---

## Step 2: Repository / directory setup

```bash
# Create service user (no login shell)
sudo useradd --system --no-create-home --shell /usr/sbin/nologin quantika-searoute || true

# Create service directory
sudo mkdir -p /opt/quantika/services/searoute
sudo chown quantika-searoute:quantika-searoute /opt/quantika/services/searoute

# Create virtualenv
sudo -u quantika-searoute python3.11 -m venv /opt/quantika/services/searoute/.venv
```

Deploy application files (run from your local machine or a CI agent):

```bash
# Option A: rsync from local repo checkout
rsync -av --delete \
  ops/searoute/ \
  root@185.249.225.169:/opt/quantika/services/searoute/

# Option B: clone/pull on VPS directly
# ssh root@185.249.225.169
# cd /opt/quantika/services/searoute
# git init && git remote add origin <repo-url>
# git pull origin main -- ops/searoute
```

---

## Step 3: requirements.txt

Create `/opt/quantika/services/searoute/requirements.txt` with this exact content:

```
searoute>=1.1.4,<2
fastapi>=0.110,<1
uvicorn[standard]>=0.30,<1
pydantic>=2.6,<3
```

Install:

```bash
sudo -u quantika-searoute \
  /opt/quantika/services/searoute/.venv/bin/pip install \
  -r /opt/quantika/services/searoute/requirements.txt
```

---

## Step 4: FastAPI app (main.py)

Create `/opt/quantika/services/searoute/main.py`:

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import searoute as sr

app = FastAPI(title="quantika-searoute", version="1.0.0")


class Req(BaseModel):
    origin: tuple[float, float]   # (lon, lat)
    dest: tuple[float, float]     # (lon, lat)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/distance")
def distance(req: Req):
    try:
        route = sr.searoute(req.origin, req.dest, units="naut")
        return {
            "distance_nm": route["properties"]["length"],
            "geometry": route["geometry"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

> **Note:** coordinate order is `(longitude, latitude)` — same as GeoJSON, matching the searoute-py convention.

---

## Step 5: systemd unit

The canonical unit file is committed in the repository at `ops/systemd/quantika-searoute.service`. Copy it to the host and enable the service:

```bash
# Copy from repo (run on VPS after the file is deployed)
sudo cp /opt/quantika/services/searoute/ops/systemd/quantika-searoute.service \
        /etc/systemd/system/quantika-searoute.service

# Or paste directly — content matches the committed unit exactly:
# WorkingDirectory=/opt/quantika/services/searoute
# ExecStart=/opt/quantika/services/searoute/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8200

sudo systemctl daemon-reload
sudo systemctl enable --now quantika-searoute.service
sudo systemctl status quantika-searoute.service
```

Expected status output: `Active: active (running)`.

---

## Step 6: Firewall

Port 8200 must be reachable only from localhost (Next.js on the same host). Block external access:

```bash
# Deny all external access to 8200
sudo ufw deny 8200/tcp

# Reload to apply
sudo ufw reload

# Verify
sudo ufw status | grep 8200
```

If Next.js runs on a **different host**, replace the deny rule:

```bash
# Allow only from Next.js server IP
sudo ufw allow from <NEXT_JS_HOST_IP> to any port 8200
sudo ufw deny 8200/tcp
sudo ufw reload
```

---

## Step 7: nginx reverse proxy (optional)

Internal HTTP on `:8200` is sufficient for same-host Next.js calls. Skip this step unless you need:
- TLS termination for inter-service HTTPS
- A named `searoute.internal` hostname

If needed, add to `/etc/nginx/sites-available/quantika-searoute`:

```nginx
server {
    listen 8201 ssl;
    server_name searoute.internal;

    ssl_certificate     /etc/ssl/certs/quantika-internal.crt;
    ssl_certificate_key /etc/ssl/private/quantika-internal.key;

    location / {
        proxy_pass http://127.0.0.1:8200;
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/quantika-searoute \
           /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 8: Smoke tests

Run these on the VPS (or via SSH):

```bash
# Health check
curl -s http://localhost:8200/health
# Expected: {"ok":true}

# Distance: Singapore → Rotterdam (via Suez)
curl -s -X POST http://localhost:8200/distance \
  -H 'Content-Type: application/json' \
  -d '{"origin":[103.83,1.27],"dest":[4.48,51.92]}'
# Expected: distance_nm ~ 8200, geometry.type = "LineString"

# Quick parse check
curl -s -X POST http://localhost:8200/distance \
  -H 'Content-Type: application/json' \
  -d '{"origin":[103.83,1.27],"dest":[4.48,51.92]}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('distance_nm:', d['distance_nm'])"
```

---

## Step 9: Logs and monitoring

```bash
# Follow live logs
journalctl -u quantika-searoute -f

# Last 100 lines
journalctl -u quantika-searoute -n 100 --no-pager

# Errors only
journalctl -u quantika-searoute -p err --since "1 hour ago"

# Service resource usage
systemctl status quantika-searoute.service
```

Future: extend with Sentry DSN if Next.js already has Sentry configured — add `sentry-sdk[fastapi]` to requirements.txt and initialize in `main.py` before `app = FastAPI(...)`.

---

## Step 10: Rollback

If the service is misbehaving, fall back to Haversine in Next.js without touching the Python service:

```bash
# On VPS: update .env for the Next.js app
# Edit /root/quantika-demo/.env.local (or equivalent)
KNOWLEDGE_LAYER_DISTANCES_ENABLED=false

# Restart Next.js to pick up the env change
pm2 restart quantika-demo   # or: systemctl restart quantika-demo
```

To also stop the searoute service:

```bash
sudo systemctl stop quantika-searoute.service
sudo systemctl disable quantika-searoute.service
```

To re-enable after fixing:

```bash
sudo systemctl enable --now quantika-searoute.service
# Then set KNOWLEDGE_LAYER_DISTANCES_ENABLED=true and restart Next.js
```
