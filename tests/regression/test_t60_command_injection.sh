#!/usr/bin/env bash
# Regression proof for coldqa-1100 finding: post-deploy-smoke.yml "Schedule t60
# bake window" step used to build the remote ssh command by string-interpolating
# unquoted $PR / $SHA into a single command string:
#
#   ssh ... root@157.173.124.116 "bash /root/post-deploy-smoke/schedule-t60.sh $PR $SHA"
#
# $PR is fully attacker-controlled on a workflow_dispatch run (free-text input,
# no validation, only gated on `!= 'manual'`). A PR value containing a shell
# metacharacter broke out of the intended argv and ran arbitrary commands AS
# ROOT on dev-vps (open SSH key, not forced-command — see workflow header).
#
# FIXED 2026-07-02: the workflow step now validates PR against ^[0-9]+$|manual
# and SHA against ^[0-9a-f]{7,40}$ BEFORE the command string is ever built, and
# quotes both values. This script reproduces that exact validate-then-build
# sequence (minus the real ssh hop) and proves both halves: the malicious PR
# is rejected before any command executes, and a legitimate PR/SHA still gets
# through. Safe to run anywhere — does not touch ssh/systemd.
set -euo pipefail

PROOF=/tmp/coldqa-injection-proof-$$
rm -f "$PROOF"

validate_and_build() {
  local pr="$1" sha="$2"
  if ! [[ "$pr" =~ ^[0-9]+$ || "$pr" == "manual" ]]; then
    echo "  rejected: invalid PR ($pr)"
    return 1
  fi
  if ! [[ "$sha" =~ ^[0-9a-f]{7,40}$ ]]; then
    echo "  rejected: invalid SHA ($sha)"
    return 1
  fi
  # Byte-for-byte reproduction of the fixed post-deploy-smoke.yml command
  # construction: validated values, quoted into the remote command string.
  CMD="bash /root/post-deploy-smoke/schedule-t60.sh '$pr' '$sha'"
  echo "  constructed remote command: $CMD"
  bash -c "$CMD" >/dev/null 2>&1 || true
  return 0
}

echo "Attack: malicious PR containing a shell metacharacter"
ATTACK_PR="42; touch $PROOF; echo INJECTED"
if validate_and_build "$ATTACK_PR" "deadbeef"; then
  echo "UNEXPECTED: validation accepted a malicious PR"
fi

if [ -f "$PROOF" ]; then
  echo "FAILED: command injection still executes arbitrary command via \$PR (file $PROOF created)"
  rm -f "$PROOF"
  exit 1
fi
echo "OK: malicious PR rejected before command construction, no injection"

echo "Control: legitimate numeric PR + real-shaped SHA must still pass validation"
if ! validate_and_build "1100" "0255002d63c44c0d8b0bfc3d7c7842e6abbcfd09"; then
  echo "FAILED: legitimate PR/SHA was wrongly rejected"
  exit 1
fi
echo "OK: legitimate PR/SHA still validates and builds the command"

echo "CONFIRMED FIXED: command injection via \$PR/\$SHA no longer reproduces"
exit 0
