/**
 * @jest-environment jsdom
 */
import { haptic, __HAPTIC_PATTERNS__ } from '@/lib/mobile/haptics';

describe('haptics', () => {
  let vibrateMock: jest.Mock;

  beforeEach(() => {
    vibrateMock = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('calls navigator.vibrate with 10ms for tap', () => {
    haptic('tap');
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });

  it('calls navigator.vibrate with success pattern', () => {
    haptic('success');
    expect(vibrateMock).toHaveBeenCalledWith([10, 50, 10]);
  });

  it('calls navigator.vibrate with warning pattern', () => {
    haptic('warning');
    expect(vibrateMock).toHaveBeenCalledWith([30, 50, 30]);
  });

  it('calls navigator.vibrate with error pattern', () => {
    haptic('error');
    expect(vibrateMock).toHaveBeenCalledWith([50, 100, 50]);
  });

  it('is a no-op when navigator.vibrate is missing', () => {
    Object.defineProperty(navigator, 'vibrate', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(() => haptic('tap')).not.toThrow();
  });

  it('swallows errors thrown by navigator.vibrate', () => {
    Object.defineProperty(navigator, 'vibrate', {
      value: () => {
        throw new Error('boom');
      },
      configurable: true,
      writable: true,
    });
    expect(() => haptic('error')).not.toThrow();
  });

  it('exposes pattern map with all four patterns', () => {
    expect(Object.keys(__HAPTIC_PATTERNS__).sort()).toEqual(
      ['error', 'success', 'tap', 'warning'],
    );
  });
});
