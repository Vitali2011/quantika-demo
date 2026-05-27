/**
 * Boot-time validator for DEMO_MODE.
 * Called from instrumentation.ts on server start.
 * Fails fast if demo-seed.db is missing, preventing a confusing runtime error later.
 */
import * as fs from 'fs';

export function validateDemoBoot(): void {
  if (process.env.DEMO_MODE !== 'true') return;
  const dbPath = process.env.SESSIONS_DB_PATH;
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error(
      `DEMO_MODE=true but demo-seed.db not found at SESSIONS_DB_PATH=${dbPath}. ` +
        `Run: tsx scripts/demo-seed/build.ts`,
    );
  }
}
