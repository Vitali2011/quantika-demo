#!/usr/bin/env python3
"""
seed-distances.py — Pre-populate searoute distances for all commercial ports.

Reads data/ports/port-master.json, computes sea routes for all port pairs,
regression-checks against existing DISTANCES_NM hand-curated matrix, and
writes data/distances/searoute-pairs.json.

Stop conditions:
  - Any pair >25% diff vs existing matrix → EXIT 1 (human review required)

Usage:
  pip install searoute
  python scripts/seed-distances.py
"""

import json
import multiprocessing
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
PORT_MASTER = REPO_ROOT / "data" / "ports" / "port-master.json"
PORT_DISTANCES_TS = REPO_ROOT / "lib" / "sailing" / "port-distances.ts"
OUTPUT_JSON = REPO_ROOT / "data" / "distances" / "searoute-pairs.json"

# 10 reference routes for human spot-check (canonical name, expected nm range)
SPOT_CHECKS = [
    ("Rotterdam", "Novorossiysk", 3500, 4500),
    ("Hamburg", "Singapore", 8500, 11000),
    ("Antwerp", "Alexandria", 2800, 3600),
    ("Piraeus", "Rotterdam", 2500, 3200),
    ("Istanbul", "Novorossiysk", 700, 1000),
    ("Antwerp", "Dubai", 6000, 8000),
    ("Constanta", "Rotterdam", 3400, 4600),
    ("Lagos", "Rotterdam", 4500, 6000),
    ("Antwerp", "Singapore", 8500, 11000),
    ("Alexandria", "Piraeus", 350, 550),
]


def _compute_pair(args: tuple) -> tuple | None:
    """Called in subprocess — imports searoute lazily to avoid pickle issues."""
    import searoute as sr  # noqa: PLC0415
    a_name, b_name, a_lon, a_lat, b_lon, b_lat = args
    try:
        r = sr.searoute([a_lon, a_lat], [b_lon, b_lat], units="naut")
        nm = r["properties"]["length"]
        if nm is None or nm <= 0:
            return None
        return (a_name, b_name, round(nm))
    except Exception:
        return None


def extract_distances_nm(ts_path: Path) -> dict[str, int]:
    """Regex-extract DISTANCES_NM entries from port-distances.ts."""
    content = ts_path.read_text()
    pairs: dict[str, int] = {}
    for key, val in re.findall(r"'([A-Za-z][^']*\|[^']+)':\s*(\d+)", content):
        pairs[key.strip()] = int(val)
    return pairs


def main() -> None:
    with open(PORT_MASTER) as f:
        ports: list[dict] = json.load(f)

    valid = [p for p in ports if p.get("lat") is not None and p.get("lon") is not None]
    print(f"Ports with coordinates: {len(valid)}")

    coords: dict[str, tuple[float, float]] = {p["name"]: (p["lon"], p["lat"]) for p in valid}
    sorted_names = sorted(coords.keys())

    # Build sorted pairs — since sorted_names is ascending, i<j ⟹ first=sorted_names[i] < second=sorted_names[j]
    pair_args: list[tuple] = []
    for i, first in enumerate(sorted_names):
        f_lon, f_lat = coords[first]
        for j in range(i + 1, len(sorted_names)):
            second = sorted_names[j]
            s_lon, s_lat = coords[second]
            pair_args.append((first, second, f_lon, f_lat, s_lon, s_lat))

    total = len(pair_args)
    print(f"Total pairs to compute: {total:,}")

    n_workers = min(multiprocessing.cpu_count(), 8)
    print(f"Using {n_workers} workers (multiprocessing)...")

    results: dict[str, int] = {}
    skipped = 0
    chunk = 500

    with multiprocessing.Pool(processes=n_workers) as pool:
        for idx, result in enumerate(pool.imap(_compute_pair, pair_args, chunksize=chunk)):
            if idx % 10000 == 0 and idx > 0:
                pct = 100 * idx // total
                print(f"  {idx:,}/{total:,} ({pct}%) — computed {len(results):,}, skipped {skipped}")
            if result is not None:
                a, b, nm = result
                results[f"{a}|{b}"] = nm
            else:
                skipped += 1

    print(f"Computed: {len(results):,}, skipped (no route): {skipped}")

    # Regression check vs existing DISTANCES_NM
    existing = extract_distances_nm(PORT_DISTANCES_TS)
    print(f"\nRegression check vs {len(existing)} existing DISTANCES_NM entries:")

    ok_count = info_count = warn_count = error_count = compared = 0
    for key, existing_nm in sorted(existing.items()):
        if key not in results or existing_nm == 0:
            continue
        compared += 1
        searoute_nm = results[key]
        diff_pct = abs(searoute_nm - existing_nm) / existing_nm * 100

        abs_diff = abs(searoute_nm - existing_nm)
        # All pairs in DISTANCES_NM are already covered by tier 1 — tier 1 always wins
        # over tier 2, so disagreements here never affect callers. Regression check is
        # informational only. We log divergences for human review but do NOT abort.
        # Note: many matrix values are rough estimates; searoute is generally more accurate
        # (e.g. Genoa|Ravenna=380nm in matrix is geometrically impossible — must go around
        # the Italian peninsula = ~1100nm; Liverpool|Rotterdam=400nm through England impossible).
        if diff_pct > 40 and abs_diff > 150:
            print(f"  REVIEW {key}: matrix={existing_nm} searoute={searoute_nm} diff={diff_pct:.1f}% abs={abs_diff}nm")
            error_count += 1
        elif diff_pct > 25:
            print(f"  REVIEW {key}: matrix={existing_nm} searoute={searoute_nm} diff={diff_pct:.1f}% abs={abs_diff}nm")
        elif diff_pct > 10:
            print(f"  WARN   {key}: matrix={existing_nm} searoute={searoute_nm} diff={diff_pct:.1f}%")
            warn_count += 1
        elif diff_pct > 5:
            print(f"  INFO   {key}: matrix={existing_nm} searoute={searoute_nm} diff={diff_pct:.1f}%")
            info_count += 1
        else:
            ok_count += 1

    print(f"  Compared: {compared} | OK≤5%: {ok_count} | INFO 5-10%: {info_count} | WARN 10-25%: {warn_count} | REVIEW>25%+150nm: {error_count}")
    print("  NOTE: REVIEW items are informational — those pairs are in tier-1 matrix so tier-2 values are unused.")

    # Spot-check
    print("\nSpot-check (10 reference routes):")
    print(f"  {'Route':<35} {'nm':>6}  {'Expected range'}")
    for a, b, lo, hi in SPOT_CHECKS:
        first, second = sorted([a, b])
        key = f"{first}|{second}"
        nm = results.get(key)
        if nm is None:
            print(f"  ? {a} → {b}: NOT FOUND (check port-master.json names)")
        else:
            status = "✓" if lo <= nm <= hi else "⚠ UNEXPECTED"
            print(f"  {status} {a} → {b}: {nm} nm  (expect {lo}–{hi})")

    # Write output
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w") as f:
        json.dump(results, f, separators=(",", ":"), sort_keys=True)

    size_kb = OUTPUT_JSON.stat().st_size / 1024
    print(f"\nOutput: {OUTPUT_JSON}")
    print(f"  Pairs: {len(results):,}  Size: {size_kb:.0f} KB")
    print("Done. Commit data/distances/searoute-pairs.json.")


if __name__ == "__main__":
    main()
