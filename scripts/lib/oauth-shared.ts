/**
 * Shared OAuth2 utilities for Gmail integration.
 * Used by: scripts/setup-gmail-oauth.ts, scripts/import-gmail-emails.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { google, gmail_v1 } from 'googleapis';

export const REDIRECT_URI = 'http://127.0.0.1:53682/oauth-callback';
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export const DEFAULT_CREDENTIALS_PATH = path.resolve(process.cwd(), '.private/oauth-credentials.json');
export const DEFAULT_TOKEN_PATH = path.resolve(process.cwd(), '.private/oauth-token.txt');

export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

/**
 * Loads OAuth credentials from a JSON file downloaded from Google Cloud Console.
 * Supports both "installed" and "web" credential formats.
 * @param filePath - defaults to .private/oauth-credentials.json
 */
export function loadOAuthCredentials(filePath: string = DEFAULT_CREDENTIALS_PATH): OAuthCredentials {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new Error(
        `oauth-credentials.json not found at: ${filePath}\n` +
        'Download it from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → Download JSON'
      );
    }
    throw err;
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Failed to parse OAuth credentials JSON at ${filePath}`);
  }

  const section = (json['installed'] ?? json['web']) as Record<string, unknown> | undefined;
  if (!section) {
    throw new Error(
      `Invalid OAuth credentials format at ${filePath}: expected "installed" or "web" key`
    );
  }

  return {
    client_id: section['client_id'] as string,
    client_secret: section['client_secret'] as string,
    redirect_uri: REDIRECT_URI, // Always use our fixed redirect URI
  };
}

/**
 * Loads the refresh token from a plain-text file.
 * Throws a descriptive error if the file is missing or the token is empty.
 * @param filePath - defaults to .private/oauth-token.txt
 */
export function loadRefreshToken(filePath: string = DEFAULT_TOKEN_PATH): string {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new Error(
        `oauth-token.txt not found at: ${filePath}\n` +
        'Run: npx tsx scripts/setup-gmail-oauth.ts to obtain a refresh token'
      );
    }
    throw err;
  }

  const token = raw.trim();
  if (!token) {
    throw new Error(`Refresh token is empty or invalid in: ${filePath}`);
  }

  return token;
}

/**
 * Creates an authenticated Gmail API client.
 * @param creds - OAuth2 credentials (client_id, client_secret, redirect_uri)
 * @param refreshToken - the persisted refresh token
 * @returns gmail_v1.Gmail client
 */
export function createGmailClient(creds: OAuthCredentials, refreshToken: string): gmail_v1.Gmail {
  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uri
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}
