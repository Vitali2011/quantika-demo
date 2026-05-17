"""
Test suite for searoute microservice.
TDD RED phase — tests written before implementation.
"""
import pytest
from fastapi.testclient import TestClient


def test_health_returns_ok():
    """GET /health should return 200 with status ok."""
    from main import app
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_distance_singapore_to_rotterdam():
    """
    POST /distance with Singapore (1.29, 103.85) → Rotterdam (51.92, 4.48)
    should return ~8300 nm via Suez (±10% tolerance).
    """
    from main import app
    client = TestClient(app)
    response = client.post("/distance", json={
        "origin_lat": 1.29,
        "origin_lon": 103.85,
        "dest_lat": 51.92,
        "dest_lon": 4.48,
        "route_via": "suez"
    })
    assert response.status_code == 200
    data = response.json()
    assert "distance_nm" in data
    # Expected ~8300 nm, allow ±10%
    assert 7470 <= data["distance_nm"] <= 9130, f"Got {data['distance_nm']}, expected 8300±10%"
    assert data["route_via"] == "suez"
    assert data["waypoints_count"] > 0
    assert data["calculator_version"] == "searoute-py-1.2.0"


def test_distance_invalid_latitude_rejects():
    """origin_lat=91 (out of range) should return 422."""
    from main import app
    client = TestClient(app)
    response = client.post("/distance", json={
        "origin_lat": 91,
        "origin_lon": 0,
        "dest_lat": 0,
        "dest_lon": 0,
        "route_via": "direct"
    })
    assert response.status_code == 422


def test_distance_invalid_longitude_rejects():
    """origin_lon=181 (out of range) should return 422."""
    from main import app
    client = TestClient(app)
    response = client.post("/distance", json={
        "origin_lat": 0,
        "origin_lon": 181,
        "dest_lat": 0,
        "dest_lon": 0,
        "route_via": "direct"
    })
    assert response.status_code == 422


def test_distance_same_origin_dest_returns_zero():
    """When origin == dest, distance should be ~0."""
    from main import app
    client = TestClient(app)
    response = client.post("/distance", json={
        "origin_lat": 1.29,
        "origin_lon": 103.85,
        "dest_lat": 1.29,
        "dest_lon": 103.85,
        "route_via": "direct"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["distance_nm"] < 1, f"Expected ~0, got {data['distance_nm']}"
    assert data["route_via"] == "direct"


def test_distance_landlocked_coords_returns_valid_route():
    """
    Land-locked coords (middle of Sahara) still return valid route.
    searoute-py 1.2.0 automatically finds nearest port — no error thrown.
    Sahara center: ~23.8N, 10.0E
    """
    from main import app
    client = TestClient(app)
    response = client.post("/distance", json={
        "origin_lat": 23.8,
        "origin_lon": 10.0,
        "dest_lat": 51.92,
        "dest_lon": 4.48,
        "route_via": "direct"
    })
    assert response.status_code == 200
    data = response.json()
    # Should still return valid distance (library finds nearest port)
    assert data["distance_nm"] > 0


def test_distance_transpacific_direct():
    """
    Trans-Pacific route: Tokyo (35.68, 139.69) → San Francisco (37.77, -122.42)
    Should return non-trivial distance.
    """
    from main import app
    client = TestClient(app)
    response = client.post("/distance", json={
        "origin_lat": 35.68,
        "origin_lon": 139.69,
        "dest_lat": 37.77,
        "dest_lon": -122.42,
        "route_via": "direct"
    })
    assert response.status_code == 200
    data = response.json()
    # Trans-Pacific ~4500 nm, check > 4000
    assert data["distance_nm"] > 4000, f"Expected >4000, got {data['distance_nm']}"
    assert data["route_via"] == "direct"


def test_restrictions_map_uses_only_valid_passages():
    """H2 regression: RESTRICTIONS_MAP must not contain 'cape' as a restriction value."""
    from main import RESTRICTIONS_MAP
    VALID_PASSAGES = {'babalmandab', 'bosporus', 'gibraltar', 'suez', 'panama', 'ormuz', 'northwest'}
    for route_key, restrictions in RESTRICTIONS_MAP.items():
        for r in restrictions:
            assert r in VALID_PASSAGES, (
                f"RESTRICTIONS_MAP['{route_key}'] contains invalid passage '{r}'; "
                f"valid: {VALID_PASSAGES}"
            )


def test_distance_route_via_suez_is_shorter_than_cape():
    """
    H2 regression: route_via='suez' must return Suez route distance.
    Singapore→Rotterdam via suez ~8387 nm, far shorter than cape ~10419 nm.
    """
    from main import app
    client = TestClient(app)
    response = client.post("/distance", json={
        "origin_lat": 1.29,
        "origin_lon": 103.85,
        "dest_lat": 51.92,
        "dest_lon": 4.48,
        "route_via": "suez"
    })
    assert response.status_code == 200
    suez_dist = response.json()["distance_nm"]
    assert 7500 <= suez_dist <= 9000, f"Suez distance {suez_dist} out of expected [7500, 9000]"


def test_distance_route_via_cape_restrictions():
    """
    route_via='cape' should force restrictions=['suez', 'panama'].
    Singapore → Rotterdam via cape should be longer than via suez.
    """
    from main import app
    client = TestClient(app)
    response_cape = client.post("/distance", json={
        "origin_lat": 1.29,
        "origin_lon": 103.85,
        "dest_lat": 51.92,
        "dest_lon": 4.48,
        "route_via": "cape"
    })
    response_suez = client.post("/distance", json={
        "origin_lat": 1.29,
        "origin_lon": 103.85,
        "dest_lat": 51.92,
        "dest_lon": 4.48,
        "route_via": "suez"
    })
    assert response_cape.status_code == 200
    assert response_suez.status_code == 200
    # Cape route must be longer
    assert response_cape.json()["distance_nm"] > response_suez.json()["distance_nm"]
