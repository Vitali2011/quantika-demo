import { processEmail } from '@/lib/jobs/process-email';
import { jobEvents } from '@/lib/jobs/event-emitter';

describe('processEmail', () => {
  it('emits job-update events during processing', async () => {
    const received: unknown[] = [];
    const off = jobEvents.subscribe('test-user', (e) => received.push(e));
    await processEmail({ userId: 'test-user', jobId: 'j-test', emailBody: 'HSS cargo from Constanta' });
    off();
    const types = received.map((r: any) => r.type);
    expect(types).toContain('job-update');
  });

  it('emits done status at 100% on completion', async () => {
    const received: unknown[] = [];
    const off = jobEvents.subscribe('test-user-2', (e) => received.push(e));
    await processEmail({ userId: 'test-user-2', jobId: 'j-test-2', emailBody: 'vessel open Rotterdam' });
    off();
    const done = (received as any[]).find(
      (r) => r.type === 'job-update' && r.data.progress_percent === 100,
    );
    expect(done).toBeDefined();
    expect(done.data.status).toBe('done');
  });

  it('passes email_subject and from through to events', async () => {
    const received: unknown[] = [];
    const off = jobEvents.subscribe('test-user-3', (e) => received.push(e));
    await processEmail({
      userId: 'test-user-3',
      jobId: 'j-test-3',
      emailBody: 'test',
      emailSubject: 'HSS Constanta',
      from: 'Boris',
    });
    off();
    const first = (received as any[])[0];
    expect(first.data.email_subject).toBe('HSS Constanta');
    expect(first.data.from).toBe('Boris');
  });
});
