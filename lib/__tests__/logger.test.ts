import { logger, createLogger } from '../logger';

describe('logger exports', () => {
  it('exports logger as a truthy object with log methods', () => {
    expect(logger).toBeTruthy();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('createLogger with no args returns a child logger with log methods', () => {
    const child = createLogger();
    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');
    expect(typeof child.debug).toBe('function');
  });

  it('createLogger with requestId returns a distinct object from base logger', () => {
    const child = createLogger('req-abc');
    expect(child).not.toBe(logger);
  });

  it('createLogger propagates requestId in bindings', () => {
    const child = createLogger('test-id');
    expect(child.bindings().requestId).toBe('test-id');
  });
});
