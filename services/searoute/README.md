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

For systemd-based deployment on VPS:

1. Copy service files to `/opt/quantika/services/searoute/`
2. Create virtual environment and install dependencies
3. Copy systemd unit file (see task D3 spec)
4. Enable and start service:

```bash
sudo systemctl enable quantika-searoute
sudo systemctl start quantika-searoute
sudo systemctl status quantika-searoute
```

## Notes

- Service runs on port **8200** by default
- Uses searoute-py 1.2.0 for sea route calculations
- Stateless service — safe for concurrent requests
- Land-locked coordinates automatically route to nearest port (library behavior)
