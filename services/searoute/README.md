# Quantika Searoute Service

Python microservice for calculating sea route distances using [searoute-py](https://github.com/genthalili/searoute-py).

## Overview

This service provides REST endpoints to calculate maritime distances between geographic coordinates, supporting different routing preferences (Suez, Cape of Good Hope, Panama, direct).

## Requirements

- Python 3.11+
- Dependencies: see `requirements.txt`

## Local Development

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # or `.venv/bin/activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn main:app --host 127.0.0.1 --port 8200 --reload

# Run tests
pytest test_main.py -v
```

## Docker Deployment

```bash
# Build image
docker build -t quantika-searoute:latest .

# Run container
docker run -d -p 8200:8200 --name searoute quantika-searoute:latest
```

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

### POST /distance

Calculate sea route distance between two points.

**Request:**
```json
{
  "origin_lat": 1.29,
  "origin_lon": 103.85,
  "dest_lat": 51.92,
  "dest_lon": 4.48,
  "route_via": "suez"
}
```

**Parameters:**
- `origin_lat`, `dest_lat`: Latitude in range [-90, 90]
- `origin_lon`, `dest_lon`: Longitude in range [-180, 180]
- `route_via`: Routing preference — `"suez"`, `"cape"`, `"panama"`, or `"direct"`

**Response:**
```json
{
  "distance_nm": 8386.9,
  "route_via": "suez",
  "waypoints_count": 42,
  "calculator_version": "searoute-py-1.2.0"
}
```

**Error Codes:**
- `422`: Invalid coordinates or routing failed

## Routing Restrictions

- `route_via: "suez"` — Force Suez Canal route (avoid Panama and Cape)
- `route_via: "cape"` — Force around Cape of Good Hope (avoid Suez and Panama)
- `route_via: "panama"` — Force Panama Canal route (avoid Suez and Cape)
- `route_via: "direct"` — Let algorithm choose optimal route

## Production Deployment

### Option 1: Docker Compose

From project root:

```bash
docker-compose up -d searoute
```

### Option 2: Systemd (VPS)

For systemd-based deployment on VPS:

**Step 1: Deploy service files**

```bash
# Copy service files to /opt/quantika/services/searoute/
sudo mkdir -p /opt/quantika/services/searoute
sudo cp -r services/searoute/* /opt/quantika/services/searoute/
```

**Step 2: Set up Python environment**

```bash
cd /opt/quantika/services/searoute
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Step 3: Install systemd unit**

```bash
# Copy unit file to systemd directory
sudo cp ops/systemd/quantika-searoute.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload
```

**Step 4: Enable and start service**

```bash
sudo systemctl enable quantika-searoute
sudo systemctl start quantika-searoute
sudo systemctl status quantika-searoute
```

**Step 5: Verify service is running**

```bash
curl http://127.0.0.1:8200/health
# Expected: {"status": "ok", "version": "1.0.0"}
```

**Logs:**

```bash
# View service logs
sudo journalctl -u quantika-searoute -f

# View recent logs
sudo journalctl -u quantika-searoute -n 50
```

## Notes

- Service runs on port **8200** by default
- Uses searoute-py 1.2.0 for sea route calculations
- Stateless service — safe for concurrent requests
- Land-locked coordinates automatically route to nearest port (library behavior)
