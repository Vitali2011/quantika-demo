/** Error whose `.message` is always safe to show a user (never a raw SyntaxError). */
export class FriendlyHttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable = false) {
    super(message);
    this.name = 'FriendlyHttpError';
    this.status = status;
    this.retryable = retryable;
  }
}

function friendlyForStatus(status: number): string {
  if (status === 504 || status === 408) return 'The request timed out — please retry.';
  if (status >= 500) return 'The service is temporarily unavailable — please retry.';
  if (status === 0) return 'Network error — please check your connection and retry.';
  return 'Request failed — please retry.';
}

/**
 * Reads a fetch Response safely:
 *  1. content-type-guarded JSON parse (never throws a raw SyntaxError to callers),
 *  2. on !ok, prefers the server's {message|error}, else a friendly status message.
 * Throws FriendlyHttpError on any failure; returns parsed body on success.
 */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') ?? '';
  const isJson = ct.includes('application/json');

  if (!isJson) {
    if (!res.ok) throw new FriendlyHttpError(friendlyForStatus(res.status), res.status, res.status >= 500);
    throw new FriendlyHttpError('Received an unexpected response from the server — please retry.', res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new FriendlyHttpError(friendlyForStatus(res.ok ? 502 : res.status), res.status, true);
  }

  if (!res.ok) {
    const b = body as { message?: string; error?: string } | null;
    const serverMsg = b?.message ?? b?.error;
    throw new FriendlyHttpError(serverMsg ?? friendlyForStatus(res.status), res.status, res.status >= 500);
  }

  return body as T;
}
