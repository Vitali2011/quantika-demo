#!/usr/bin/env bash
# Objective oracle: run #957's REAL hidden tests against a candidate solution.
# Fresh worktree at the start SHA, apply the candidate diff, overlay #957's test files
# (from ref a8e2e3ef), run them with jest. Pass-count = conformance to the canonical
# solution. NOTE: #957's tests are partly coupled to #957's module/field names, so a
# correct-but-differently-named solution can fail imports — that is expected and is why
# the blind judge is the primary quality signal. Usage: grade-957.sh <arm> <run> [ref]
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
ARM="${1:?arm}"; RUN="${2:?run}"; REF="${3:-a8e2e3ef}"
SOL="${ROOT}/bench/war-risk/results/${ARM}/r${RUN}/solution.diff"
OUT="${ROOT}/bench/war-risk/grades/${ARM}/r${RUN}"; mkdir -p "$OUT"
[ -s "$SOL" ] || { echo "Tests: 0 (no diff)" > "${OUT}/h957.summary"; exit 0; }

WT="$(bash "${ROOT}/scripts/bench/new-run-worktree.sh" "g957-${ARM}" "$RUN")"
ln -sfn "${ROOT}/node_modules" "${WT}/node_modules"

# Apply the candidate solution onto the clean start SHA.
if ! git -C "$WT" apply --3way "$SOL" 2>"${OUT}/apply.err"; then
  git -C "$WT" apply "$SOL" 2>>"${OUT}/apply.err" || echo "APPLY_FAILED" >> "${OUT}/apply.err"
fi

# Overlay #957's hidden test files (replacing any same-named candidate tests).
TESTS=(lib/economics/__tests__/war-risk-rates.test.ts
       lib/economics/__tests__/war-risk.test.ts
       lib/matching/__tests__/tce-calculator-warrisk-suez.test.ts)
for tf in "${TESTS[@]}"; do
  mkdir -p "${WT}/$(dirname "$tf")"
  git -C "$ROOT" show "${REF}:${tf}" > "${WT}/${tf}" 2>/dev/null || true
done

( cd "$WT" && NODE_OPTIONS=--max-old-space-size=4096 npx jest "${TESTS[@]}" 2>&1 ) > "${OUT}/h957.out" || true
grep -E "^Tests:" "${OUT}/h957.out" | tail -1 > "${OUT}/h957.summary" 2>/dev/null
[ -s "${OUT}/h957.summary" ] || echo "Tests: 0 (no result / suite crash)" > "${OUT}/h957.summary"
echo "957 ${ARM} r${RUN}: $(cat ${OUT}/h957.summary)"
git worktree remove --force "$WT"
