import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

export function createLogger(requestId?: string): pino.Logger {
  return logger.child(requestId ? { requestId } : {});
}
