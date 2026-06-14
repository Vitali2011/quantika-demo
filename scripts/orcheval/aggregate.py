#!/usr/bin/env python3
# Aggregate orchestrator-rule eval: compliance rate per scenario × arm, with skill-vs-baseline
# lift. Run from repo root: python3 scripts/orcheval/aggregate.py
import json
import glob

SCENS = ["s1-no-oracle", "s2-value-check", "s3-scope", "s4-recon"]
ARMS = ["baseline", "skill-sonnet", "skill-opus"]
G = "eval/orch-rules/grades"


def rate(sc, arm):
    """(#comply, n) over runs with a parsed verdict."""
    c = n = 0
    for f in glob.glob(f"{G}/{sc}/{arm}/r*/scores.json"):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if "comply" in d:
            n += 1
            c += int(d["comply"])
    return c, n


def main():
    print(f"{'scenario':<16}{'baseline':>12}{'skill-sonnet':>14}{'skill-opus':>13}")
    tot = {a: [0, 0] for a in ARMS}
    for sc in SCENS:
        cells = []
        for a in ARMS:
            c, n = rate(sc, a)
            tot[a][0] += c
            tot[a][1] += n
            cells.append(f"{c}/{n}" if n else "—")
        print(f"{sc:<16}{cells[0]:>12}{cells[1]:>14}{cells[2]:>13}")
    print("-" * 55)
    cells = []
    for a in ARMS:
        c, n = tot[a]
        cells.append(f"{c}/{n} ({100 * c // n if n else 0}%)" if n else "—")
    print(f"{'TOTAL':<16}{cells[0]:>12}{cells[1]:>14}{cells[2]:>13}")


if __name__ == "__main__":
    main()
