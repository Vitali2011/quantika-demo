import { jobEvents, emitQuoteUpdate, QUOTE_UPDATE_EVENT } from '@/lib/jobs/event-emitter';

it('delivers quote-update events to subscribers of a session', () => {
  const seen: unknown[] = [];
  const off = jobEvents.subscribe('s1', e => { if (e.type === QUOTE_UPDATE_EVENT) seen.push(e.data); });
  emitQuoteUpdate('s1', { id: 'j1', status: 'done', email_id: 'e1' });
  off();
  expect(seen).toEqual([{ id: 'j1', status: 'done', email_id: 'e1' }]);
});
