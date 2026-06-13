#!/usr/bin/env bash
# Create a fresh worktree at the benchmark start SHA. Prints the worktree path.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
START_SHA="e242d259"
ARM="${1:?usage: new-run-worktree.sh <arm> <run>}"
RUN="${2:?usage: new-run-worktree.sh <arm> <run>}"
WT="${ROOT}/bench/war-risk/worktrees/${ARM}-r${RUN}"
git worktree remove --force "$WT" 2>/dev/null || true
git worktree add --quiet --detach "$WT" "$START_SHA"
echo "$WT"
