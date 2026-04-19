#!/bin/bash
# Preflight checks for production deploy.
# Runs BEFORE pm2 restart. Fail-fast if config is broken.
#
# Exit codes:
#   0 — all checks passed
#   1 — placeholder secret detected
#   2 — required env var missing / wrong value
set -e

ENV_FILE="${ENV_FILE:-.env.local}"
MODE="${PREFLIGHT_MODE:-prod}"   # prod | dev

if [ ! -f "$ENV_FILE" ]; then
  if [ "$MODE" = "dev" ]; then
    echo "preflight: $ENV_FILE absent (dev mode) — skipping"
    exit 0
  fi
  echo "CRITICAL: $ENV_FILE missing in prod mode" >&2
  exit 2
fi

echo "=== Preflight: $ENV_FILE ($MODE) ==="

# Gap #2 — placeholder secret scanner.
# Любое значение содержащее placeholder-substring = блок деплоя.
node -e "
const fs = require('fs');
const lines = fs.readFileSync(process.argv[1], 'utf8').split('\n');
const placeholders = ['change-this', 'replace-me', 'xxxxx', 'your-', 'placeholder', 'todo-set'];
let bad = [];
for (const line of lines) {
  const s = line.trim();
  if (!s || s.startsWith('#')) continue;
  const eq = s.indexOf('=');
  if (eq < 0) continue;
  const key = s.slice(0, eq).trim();
  const raw = s.slice(eq + 1).trim().replace(/^['\"]|['\"]\$/g, '');
  const low = raw.toLowerCase();
  if (placeholders.some(p => low.includes(p))) {
    bad.push(key + '=' + raw);
  }
}
if (bad.length) {
  console.error('CRITICAL: placeholder secrets in $ENV_FILE:');
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log('preflight: secrets OK (' + lines.length + ' lines scanned)');
" "$ENV_FILE"

# Gap #3 — USE_MIGRATION_RUNNER assertion (prod only).
if [ "$MODE" = "prod" ]; then
  VAL=$(grep -E "^USE_MIGRATION_RUNNER=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' ' | tr -d "'")
  if [ "$VAL" != "true" ]; then
    echo "CRITICAL: USE_MIGRATION_RUNNER must be 'true' on prod (got: '$VAL')" >&2
    echo "          add to $ENV_FILE: USE_MIGRATION_RUNNER=true" >&2
    exit 2
  fi
  echo "preflight: USE_MIGRATION_RUNNER=true ✓"
fi

echo "=== Preflight PASS ==="
