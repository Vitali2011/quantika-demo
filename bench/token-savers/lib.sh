#!/usr/bin/env bash
# Shared helpers for the token-savers eval rig.
set -euo pipefail
REPO="${REPO:-/root/work/quantika-demo}"
BASE="$REPO/bench/token-savers"
RUNS="$BASE/runs"
SRC_CFG="${SRC_CFG:-$HOME/.claude}"   # source of credentials

# make_cfg <arm> <destdir>: build a per-run CLAUDE_CONFIG_DIR.
# Clean (no ambient skills) by default; arms.sh mutates it further.
make_cfg() {
  local arm="$1" dir="$2"
  mkdir -p "$dir"
  printf '{"defaultMode":"acceptEdits"}' > "$dir/settings.json"
  # copy creds only (NOT settings/skills) so superpowers can't hijack into a plan
  cp "$SRC_CFG/.credentials.json" "$dir/.credentials.json" 2>/dev/null || true
  # symlink daemon dir so subprocess can refresh expired OAuth tokens via running daemon
  ln -sfn "$SRC_CFG/daemon" "$dir/daemon" 2>/dev/null || true
}

# worktree_at <sha> <dir>: detached worktree at a fixed SHA.
worktree_at() {
  local sha="$1" dir="$2"
  git -C "$REPO" worktree add --detach "$dir" "$sha" >/dev/null
}

# count_live_worktrees: number of active eval worktrees (throttle signal).
count_live_worktrees() { git -C "$REPO" worktree list | grep -c "$RUNS/" || true; }

# usage_from_json <result.json> -> "cost_usd duration_ms input_tok output_tok"
usage_from_json() {
  node -e '
    const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const u=j.usage||{};
    console.log([j.total_cost_usd||0, j.duration_ms||0, u.input_tokens||0, u.output_tokens||0].join(" "));
  ' "$1"
}
