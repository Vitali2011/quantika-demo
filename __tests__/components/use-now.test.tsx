/** @jest-environment jsdom */
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DemoClockProvider, useNow } from '@/lib/demo-clock-context';

function wrapper(frozenMs: number | null) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DemoClockProvider frozenMs={frozenMs}>{children}</DemoClockProvider>
  );
  Wrapper.displayName = 'TestDemoClockWrapper';
  return Wrapper;
}

describe('useNow (demo clock)', () => {
  it('DEMO_MODE: returns the frozen ms, available immediately (no flash, no decay)', () => {
    const frozen = Date.UTC(2026, 4, 28); // 2026-05-28
    const { result } = renderHook(() => useNow(), { wrapper: wrapper(frozen) });
    expect(result.current).toBe(frozen);
  });

  it('DEMO_MODE: stays constant even with a tick interval requested', () => {
    const frozen = 1_700_000_000_000;
    const { result } = renderHook(() => useNow(1000), { wrapper: wrapper(frozen) });
    expect(result.current).toBe(frozen);
  });

  it('live mode: resolves to a real timestamp after mount', async () => {
    const before = Date.now();
    const { result } = renderHook(() => useNow(), { wrapper: wrapper(null) });
    await act(async () => {
      await Promise.resolve();
    });
    expect(typeof result.current).toBe('number');
    expect(result.current as number).toBeGreaterThanOrEqual(before);
  });

  it('no provider (default null context): behaves as live mode', async () => {
    const { result } = renderHook(() => useNow());
    await act(async () => {
      await Promise.resolve();
    });
    expect(typeof result.current).toBe('number');
  });
});
