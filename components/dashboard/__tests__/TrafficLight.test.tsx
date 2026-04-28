import { TrafficLight } from '../TrafficLight';

describe('TrafficLight', () => {
  it('renders red circle for urgent priority', () => {
    const el = TrafficLight({ priority: 'urgent' });
    expect(el).not.toBeNull();
    const text = JSON.stringify(el);
    expect(text).toContain('🔴');
  });

  it('renders warning for attention priority', () => {
    const el = TrafficLight({ priority: 'attention' });
    expect(el).not.toBeNull();
    const text = JSON.stringify(el);
    expect(text).toContain('⚠️');
  });

  it('renders green check for ok priority', () => {
    const el = TrafficLight({ priority: 'ok' });
    expect(el).not.toBeNull();
    const text = JSON.stringify(el);
    expect(text).toContain('✅');
  });

  it('returns a span element', () => {
    const el = TrafficLight({ priority: 'ok' });
    expect(el?.type).toBe('span');
  });
});
