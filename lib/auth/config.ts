/**
 * lib/auth/config.ts
 * Reads DEMO_AUTH_* environment variables with defaults and validation.
 */

export interface AuthConfig {
  enabled: boolean;
  user: string;
  password: string;
  secret: string | null;
  cookieDays: number;
}

export function getAuthConfig(): AuthConfig {
  const enabled = process.env.DEMO_AUTH_ENABLED === 'true';
  const user = process.env.DEMO_AUTH_USER ?? 'admin';
  const password = process.env.DEMO_AUTH_PASSWORD ?? '';
  const secret = process.env.DEMO_AUTH_SECRET ?? null;
  const rawDays = parseInt(process.env.DEMO_AUTH_COOKIE_DAYS ?? '', 10);
  const cookieDays = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 7;

  return { enabled, user, password, secret, cookieDays };
}
