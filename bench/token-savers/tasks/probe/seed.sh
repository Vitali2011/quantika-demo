#!/usr/bin/env bash
# seed.sh <worktree> : plant 5 stale/contradictory directives, echo their file:line to stdout.
set -euo pipefail; wt="$1"
mkdir -p "$wt/docs"
plant() { # <file> <marker-line-text>
  echo "$2" >> "$wt/$1"; echo "$1:$(wc -l < "$wt/$1" | tr -d ' ')";
}
plant docs/SEED_A.md "STALE: references middleware-045 which was removed"
plant docs/SEED_B.md "CONTRADICTION: says KNOWLEDGE_RAG_ENABLED default true (actual: false)"
plant docs/SEED_C.md "STALE: points to lib/old-retriever.ts (deleted)"
plant docs/SEED_D.md "WRONG: claims claude-cli allowed in request handlers"
plant docs/SEED_E.md "STALE: ADMIN_TOKEN optional (actual: 500 if unset)"
