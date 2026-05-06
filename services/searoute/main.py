"""
Quantika Searoute Service — sea route distance calculator.
Uses searoute-py library for maritime routing.
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Literal
import searoute as sr

app = FastAPI(title="Quantika Searoute Service", version="1.0.0")


class DistanceRequest(BaseModel):
    """Request model for distance calculation."""
    origin_lat: float = Field(..., ge=-90, le=90)
    origin_lon: float = Field(..., ge=-180, le=180)
    dest_lat: float = Field(..., ge=-90, le=90)
    dest_lon: float = Field(..., ge=-180, le=180)
    route_via: Literal['suez', 'cape', 'panama', 'direct'] = 'direct'


class DistanceResponse(BaseModel):
    """Response model for distance calculation."""
    distance_nm: float
    route_via: str
    waypoints_count: int
    calculator_version: str = "searoute-py-1.2.0"


# RESTRICTIONS_MAP defines which canals to avoid for each routing preference
RESTRICTIONS_MAP = {
    'cape':   ['suez', 'panama'],   # force around Cape of Good Hope
    'suez':   ['panama', 'cape'],    # force Suez Canal (no Panama, no Cape)
    'panama': ['suez', 'cape'],      # force Panama Canal
    'direct': [],                    # let algorithm pick best route
}


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok", "version": app.version}


@app.post("/distance", response_model=DistanceResponse)
def distance(req: DistanceRequest):
    """
    Calculate sea route distance between two points.

    Input Contract:
    - origin_lat, dest_lat: [-90, 90] (enforced by Pydantic)
    - origin_lon, dest_lon: [-180, 180] (enforced by Pydantic)
    - route_via: one of ['suez', 'cape', 'panama', 'direct'] (enforced by Literal)
    - NaN coordinates: rejected by Pydantic
    - Same origin/dest: returns distance ~0
    - Land-locked coords: searoute raises → 422 with 'routing failed'
    """
    origin = [req.origin_lon, req.origin_lat]
    dest = [req.dest_lon, req.dest_lat]

    try:
        route = sr.searoute(
            origin, dest,
            restrictions=RESTRICTIONS_MAP[req.route_via],
            units='naut',
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"routing failed: {e}")

    return DistanceResponse(
        distance_nm=route['properties']['length'],
        route_via=req.route_via,
        waypoints_count=len(route['geometry']['coordinates']),
    )
