#!/usr/bin/env bash
# Pre-flight for the war-risk benchmark. Read-only checks + one cheap JSON sample.
# Run via: bash scripts/bench/preflight.sh   (guard-allowed bench script)
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
START_SHA="e242d259"
REF_SHA="a8e2e3ef"
fail=0
check() { if eval "$2"; then echo "OK   $1"; else echo "FAIL $1"; fail=1; fi; }

check "start SHA exists"        "git cat-file -e ${START_SHA}^{commit} 2>/dev/null"
# yaml-exists is subsumed by the JWLA-033 read below (which opens the same file).
# An explicit `git ls-tree -r | grep -q` here false-FAILs under `set -o pipefail`:
# grep -q exits on first match → SIGPIPE kills git ls-tree → pipefail reports failure.
check "yaml has JWLA-033 zone"   "git show ${START_SHA}:data/knowledge/jwc/2025-current.yaml 2>/dev/null | grep -qi 'JWLA-033'"
check "reference #957 exists"    "git cat-file -e ${REF_SHA}^{commit} 2>/dev/null"
check "brief present"            "test -f ${ROOT}/bench/war-risk/brief.md"
check "rubric present"           "test -f ${ROOT}/bench/war-risk/rubric.md"
check "prices filled (non-zero)" "node -e 'const p=require(\"${ROOT}/bench/war-risk/prices.json\");process.exit(p[\"claude-opus-4-8\"].in_per_mtok_usd>0?0:1)'"
check "claude --effort present"  "claude --help 2>&1 | grep -q -- '--effort'"

echo "-- capturing claude JSON sample (cheap) --"
claude --print --output-format json --model claude-sonnet-4-6 --effort low --max-budget-usd 0.05 \
  -p 'Reply with exactly: PREFLIGHT_OK' > "${ROOT}/bench/war-risk/usage.sample.json" 2>/dev/null
check "JSON sample has total_cost_usd" "grep -q total_cost_usd ${ROOT}/bench/war-risk/usage.sample.json"
check "JSON sample has usage tokens"   "grep -qE 'input_tokens|output_tokens' ${ROOT}/bench/war-risk/usage.sample.json"

if [ "$fail" -ne 0 ]; then echo 'PREFLIGHT FAILED'; exit 1; fi
echo 'PREFLIGHT PASSED'
