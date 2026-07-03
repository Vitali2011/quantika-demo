#!/usr/bin/env bash
# Cold RE-VERIFY (coldqa-1100b) — PROOF-OF-CONCEPT for a PRE-EXISTING CRITICAL
# that PR #1100's "command injection fixed" claim does NOT cover.
#
# PR #1100 hardened exactly ONE injection sink: the newly-added "Schedule t60
# bake window" step now validates PR/SHA and single-quotes them into the ssh
# remote command string. That sink is genuinely closed (see
# test_t60_reverify_injection.bats — the scripts' own guard also holds).
#
# BUT the SAME attacker-controlled workflow_dispatch input reaches a shell via a
# DIFFERENT, pre-existing sink the fix never touches: the "Resolve PR# + SHA"
# step does
#         PR="${{ github.event.inputs.pr }}"
# inside a run: block. GitHub Actions performs RAW TEXTUAL SUBSTITUTION of the
# ${{ }} expression into the script BEFORE bash parses it (documented GHA script
# injection). A command-substitution payload in inputs.pr therefore executes on
# the runner — which, in the same job, has secrets.DEV_VPS_SSH_KEY written to
# ~/.ssh/dev_vps_key → exfiltration == root@dev-vps. No later regex validation
# can help: the code already ran.
#
# Classification: PRE-EXISTING on main (git diff main...HEAD does NOT touch the
# Resolve step). Per test-skill regression-only gate it does NOT block PR #1100,
# but it is a live CRITICAL that needs a SEPARATE hardening PR (map every
# ${{ github.event.* }} / ${{ steps.*.outputs.* }} used in run: to an env: var
# and reference "$VAR", never inline ${{ }}).
#
# This script is a DIAGNOSTIC (always exits 0): it (a) detects the dangerous
# sink pattern in the real workflow and (b) demonstrates the injection firing.
set -o pipefail
WF="$(cd "$(dirname "$0")/../.." && pwd)/.github/workflows/post-deploy-smoke.yml"

echo "== (a) scan real workflow for \${{ ... }} interpolated into run: (injection sink) =="
if grep -nE '=[[:space:]]*"?\$\{\{[[:space:]]*(github\.event|steps\.[a-z_]+\.outputs)' "$WF"; then
  echo "   ^ PRE-EXISTING CRITICAL: attacker/derived input textually substituted into a run: shell."
else
  echo "   none found — sink appears remediated (inputs mapped via env:)."
fi

echo
echo "== (b) demonstrate the Resolve-step injection semantics (GHA textual substitution) =="
SB="$(mktemp -d)"; PWNED="$SB/GHA_RUNNER_PWNED"; rm -f "$PWNED"
# shellcheck disable=SC2016  # $(...) MUST stay literal here — it is the attacker
# payload text; the simulated runner (bash on expanded.sh) is what expands it.
ATTACK='$(touch '"$PWNED"'; echo INJECTED)'      # attacker's workflow_dispatch inputs.pr
# Exactly how the runner materializes the Resolve step after expanding the two
# ${{ github.event.inputs.* }} tokens (the dispatch branch):
# shellcheck disable=SC2016  # $PR must stay literal in the generated script body.
printf 'PR="%s"\nSHA=""\necho "pr=$PR"\n' "$ATTACK" > "$SB/expanded.sh"
bash "$SB/expanded.sh" >/dev/null 2>&1 || true
if [ -f "$PWNED" ]; then
  echo "   INJECTION FIRED: attacker command ran on the runner (created $PWNED)."
  echo "   -> with the DEV_VPS_SSH_KEY on the same runner, this is root@dev-vps."
else
  echo "   injection did not fire — payload contained/neutralized."
fi
rm -rf "$SB"

echo
echo "RESULT: informational PoC — PRE-EXISTING, out of PR #1100's fix scope. Does not"
echo "gate #1100; route to a separate workflow-hardening task (env: mapping)."
exit 0
