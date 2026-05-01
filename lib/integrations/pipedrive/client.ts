/**
 * Minimal Pipedrive REST API v1 HTTP client.
 * Pure fetch wrapper — no state, no DB access.
 */
export async function callPipedrive<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  apiDomain: string,
  accessToken: string,
  body?: unknown,
): Promise<T> {
  const url = `https://${apiDomain}/api/v1${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Pipedrive API error ${String(response.status)} ${method} ${path}: ${text}`);
  }

  return response.json() as Promise<T>;
}
