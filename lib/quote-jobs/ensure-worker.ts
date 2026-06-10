import { spawn as realSpawn } from 'node:child_process';

let lastSpawnAt = 0;
const COOLDOWN_MS = 5_000;

export function __resetWorkerStateForTest() { lastSpawnAt = 0; }

export function ensureWorker(opts: { spawnFn?: typeof realSpawn } = {}): void {
  const now = Date.now();
  if (now - lastSpawnAt < COOLDOWN_MS) return;
  lastSpawnAt = now;
  const spawnFn = opts.spawnFn ?? realSpawn;
  const env = { ...process.env };
  delete (env as Record<string, string | undefined>).NEXT_RUNTIME;
  const child = spawnFn('npm', ['run', 'quote:workshop'], { detached: true, stdio: 'ignore', env });
  child.unref();
}
