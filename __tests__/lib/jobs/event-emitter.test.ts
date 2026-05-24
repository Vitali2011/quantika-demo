import { jobEvents, emitJobUpdate, emitMatchCreated } from '@/lib/jobs/event-emitter';

describe('jobEvents per-user pub/sub', () => {
  it('per-user channels do not leak across users', () => {
    const received: unknown[] = [];
    const off = jobEvents.subscribe('user-1', (e) => received.push(e));
    emitJobUpdate('user-1', { id: 'j1', status: 'processing', progress_percent: 50 });
    emitJobUpdate('user-2', { id: 'j2', status: 'processing', progress_percent: 30 });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'job-update', data: { id: 'j1' } });
    off();
  });

  it('emitMatchCreated delivers to correct user', () => {
    const received: unknown[] = [];
    const off = jobEvents.subscribe('user-A', (e) => received.push(e));
    emitMatchCreated('user-A', { match_id: 'm1', score: 94 });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'match-created', data: { match_id: 'm1', score: 94 } });
    off();
  });

  it('unsubscribe removes handler', () => {
    const received: unknown[] = [];
    const off = jobEvents.subscribe('user-B', (e) => received.push(e));
    off();
    emitJobUpdate('user-B', { id: 'j3', status: 'processing', progress_percent: 10 });
    expect(received).toHaveLength(0);
  });

  it('multiple subscribers on same user all receive event', () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = jobEvents.subscribe('user-C', (e) => a.push(e));
    const offB = jobEvents.subscribe('user-C', (e) => b.push(e));
    emitJobUpdate('user-C', { id: 'j4', status: 'done', progress_percent: 100 });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    offA();
    offB();
  });
});
