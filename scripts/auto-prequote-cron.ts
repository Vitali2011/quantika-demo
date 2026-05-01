/**
 * β-15: cron entrypoint for nightly auto pre-quote pipeline.
 *
 * Invoked once per night (e.g. systemd timer at 03:00 server local).
 * Single-shot — does not use setInterval. Exits 0 on success, 1 on fatal
 * error. Per-email errors are reported in the JSON payload but do not
 * cause non-zero exit (they're isolated by design).
 *
 * Usage:
 *   node scripts/auto-prequote-cron.ts
 */

import { runAutoPrequote } from '../lib/auto-prequote/pipeline';

runAutoPrequote()
  .then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
