import { ensureWorker, __resetWorkerStateForTest } from '@/lib/quote-jobs/ensure-worker';

it('spawns at most one worker when called twice within cooldown', () => {
  __resetWorkerStateForTest();
  const spawned: string[][] = [];
  const fakeSpawn = ((cmd: string, args: string[]) => {
    spawned.push([cmd, ...args]);
    return { unref() {}, pid: 1 } as any;
  }) as any;
  ensureWorker({ spawnFn: fakeSpawn });
  ensureWorker({ spawnFn: fakeSpawn }); // second call within cooldown → no second spawn
  expect(spawned.length).toBe(1);
  expect(spawned[0][0]).toBe('npm');
  expect(spawned[0]).toContain('quote:workshop');
});
