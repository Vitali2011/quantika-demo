import * as Sentry from '@sentry/nextjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouteHandler = (...args: any[]) => Promise<Response>;

export interface RouteDescriptor {
  method: string;
  path: string;
}

export function withSentryApiHandler<T extends AnyRouteHandler>(
  handler: T,
  { method, path }: RouteDescriptor,
): T {
  return (async (...args: Parameters<T>) => {
    if (!Sentry.getClient()) {
      return handler(...args);
    }
    return Sentry.startSpan(
      { op: 'http.server', name: `${method} ${path}` },
      async () => {
        try {
          return await handler(...args);
        } catch (error) {
          Sentry.captureException(error, { tags: { route: path, method } });
          throw error;
        }
      },
    );
  }) as T;
}
