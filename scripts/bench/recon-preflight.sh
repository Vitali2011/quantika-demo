#!/usr/bin/env bash
# Read-only preflight for the plan+recon eval. Verifies SHAs, that the bug is present at the
# pre-fix SHA, that briefs do not leak the root, and captures one cheap JSON sample. No paid runs.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
fail=0
check(){ if eval "$2"; then echo "OK   $1"; else echo "FAIL $1"; fail=1; fi; }

check "t976 pre-fix SHA 27b7ef4f exists" "git cat-file -e 27b7ef4f^{commit} 2>/dev/null"
check "t975 pre-fix SHA d7fa1f9a exists" "git cat-file -e d7fa1f9a^{commit} 2>/dev/null"
check "war-risk start SHA e242d259 exists" "git cat-file -e e242d259^{commit} 2>/dev/null"
check "recon-976 brief present" "test -f ${ROOT}/bench/plan-recon/recon-976-brief.md"
check "recon-975 brief present" "test -f ${ROOT}/bench/plan-recon/recon-975-brief.md"
check "plan brief present"      "test -f ${ROOT}/bench/plan-recon/plan-brief.md"
check "gold roots present"      "test -f ${ROOT}/bench/plan-recon/recon-roots.md"

# Leak guard: the mechanism terms must NOT appear in the symptom briefs.
check "recon briefs do not leak root" \
  "! grep -qiE 'cbft|cubic feet|35\.3|gmail-id|session-scoped|rehydrate-guard|getMatchBySlug' ${ROOT}/bench/plan-recon/recon-976-brief.md ${ROOT}/bench/plan-recon/recon-975-brief.md"

# Bug-present sanity: the war-risk hardcoded rate exists at the #957 start SHA (plan task is real).
check "war-risk hardcoded rate present at start SHA" \
  "git show e242d259:lib/economics/war-risk.ts 2>/dev/null | grep -q '0.075'"

echo "-- cheap claude JSON sample --"
claude --print --output-format json --model claude-sonnet-4-6 --effort low --max-budget-usd 0.05 \
  -p 'Reply with exactly: RECON_PREFLIGHT_OK' > "${ROOT}/bench/plan-recon/preflight.sample.json" 2>/dev/null
check "JSON sample has total_cost_usd" "grep -q total_cost_usd ${ROOT}/bench/plan-recon/preflight.sample.json"

if [ "$fail" -ne 0 ]; then echo 'RECON-PREFLIGHT FAILED'; exit 1; fi
echo 'RECON-PREFLIGHT PASSED'
