/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import { useLiveJobs } from '../useLiveJobs';

type MockHandler = (e: Event) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  handlers: Record<string, MockHandler[]> = {};
  onerror: MockHandler | null = null;
  close = jest.fn();

  constructor() {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: MockHandler) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
  }

  emit(type: string, data: unknown) {
    const evs = this.handlers[type] ?? [];
    const ev = { data: JSON.stringify(data) } as unknown as MessageEvent;
    evs.forEach((h) => h(ev as unknown as Event));
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  (global as unknown as Record<string, unknown>).EventSource = jest.fn(
    () => new MockEventSource(),
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useLiveJobs', () => {
  it('returns initial empty state', () => {
    const { result } = renderHook(() => useLiveJobs());
    expect(result.current.jobs).toEqual([]);
    expect(result.current.latestMatch).toBeNull();
  });

  it('updates jobs on job-update event', () => {
    const { result } = renderHook(() => useLiveJobs());
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('job-update', { id: 'j1', status: 'processing', progress_percent: 50 });
    });
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0].id).toBe('j1');
    expect(result.current.jobs[0].progress_percent).toBe(50);
  });

  it('updates existing job (same id) instead of appending', () => {
    const { result } = renderHook(() => useLiveJobs());
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('job-update', { id: 'j1', status: 'processing', progress_percent: 30 });
    });
    act(() => {
      es.emit('job-update', { id: 'j1', status: 'processing', progress_percent: 70 });
    });
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0].progress_percent).toBe(70);
  });

  it('sets latestMatch on match-created event', () => {
    const { result } = renderHook(() => useLiveJobs());
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('match-created', { match_id: 'm1', score: 94, vessel_name: 'MV Atlas' });
    });
    expect(result.current.latestMatch).not.toBeNull();
    expect(result.current.latestMatch?.match_id).toBe('m1');
    expect(result.current.latestMatch?.score).toBe(94);
  });

  it('dismissMatch sets latestMatch to null', () => {
    const { result } = renderHook(() => useLiveJobs());
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('match-created', { match_id: 'm2', score: 80 });
    });
    act(() => {
      result.current.dismissMatch();
    });
    expect(result.current.latestMatch).toBeNull();
  });
});
