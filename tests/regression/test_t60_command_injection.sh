#!/usr/bin/env bash
# Regression proof for coldqa-1100 finding: post-deploy-smoke.yml "Schedule t60
# bake window" step builds the remote ssh command by string-interpolating
# unquoted $PR / $SHA into a single command string:
#
#   ssh ... root@157.173.124.116 "bash /root/post-deploy-smoke/schedule-t60.sh $PR $SHA"
#
# $PR is fully attacker-controlled on a workflow_dispatch run (free-text input,
# no validation, only gated on `!= 'manual'`). A PR value containing a shell
# metacharacter breaks out of the intended argv and runs arbitrary commands
# AS ROOT on dev-vps (open SSH key, not forced-command — see workflow header).
#
# This script reproduces the exact string-building/execution the workflow does
# (minus the real ssh hop) to prove the injection is real. It does NOT touch
# ssh/systemd — safe to run anywhere. Do NOT fix here; see .test-review/findings.md.
set -euo pipefail

PROOF=/tmp/coldqa-injection-proof-$$
rm -f "$PROOF"

PR="42; touch $PROOF; echo INJECTED"
SHA="deadbeef"

# This is a byte-for-byte reproduction of post-deploy-smoke.yml's command
# construction (the part that matters: unquoted interpolation into one string
# that a remote shell parses).
CMD="bash /root/post-deploy-smoke/schedule-t60.sh $PR $SHA"

echo "Constructed remote command (what ssh sends to the remote shell verbatim):"
echo "  $CMD"

# Simulate what the remote sshd-spawned shell does with that string.
bash -c "$CMD" >/dev/null 2>&1 || true

if [ -f "$PROOF" ]; then
  echo "CONFIRMED: command injection executed arbitrary command via \$PR (file $PROOF created)"
  rm -f "$PROOF"
  exit 1   # non-zero = bug reproduced (this script is a proof, not a "should pass" test)
else
  echo "NOT REPRODUCED — injection did not fire (re-check finding)"
  exit 0
fi
