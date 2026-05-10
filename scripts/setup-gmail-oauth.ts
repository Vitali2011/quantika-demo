/**
 * One-time Gmail OAuth2 setup script.
 * Usage: npx tsx scripts/setup-gmail-oauth.ts
 *
 * Flow:
 *  1. Reads .private/oauth-credentials.json (downloaded from Google Cloud Console)
 *  2. Generates authorization URL and prints it to stdout
 *  3. Starts a local HTTP server on 127.0.0.1:53682 to catch the OAuth callback
 *  4. Exchanges the auth code for tokens
 *  5. Persists refresh_token to .private/oauth-token.txt (chmod 0600)
 */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as readline from 'readline';
import { execFile } from 'child_process';
import { google } from 'googleapis';
import {
  loadOAuthCredentials,
  REDIRECT_URI,
  GMAIL_SCOPE,
  DEFAULT_CREDENTIALS_PATH,
  DEFAULT_TOKEN_PATH,
} from './lib/oauth-shared';

const OAUTH_PORT = 53682;
const OAUTH_HOST = '127.0.0.1';

// ── Pure functions (exported for unit-testing) ──────────────────────────────

/**
 * Generates the Google OAuth2 authorization URL.
 */
export function buildAuthUrl(clientId: string, clientSecret: string): string {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Required to always get refresh_token
    scope: [GMAIL_SCOPE],
  });
}

/**
 * Parses the OAuth callback query string.
 * Returns { code, state } — code may be null if not present.
 */
export function parseCallbackQuery(queryString: string): { code: string | null; state?: string } {
  if (!queryString) return { code: null };
  const params = new URLSearchParams(queryString);
  const code = params.get('code');
  const state = params.get('state') ?? undefined;
  return { code, state };
}

/**
 * Persists the refresh token to disk.
 * Creates parent directory if needed, writes plain text, chmods to 0600.
 * Throws if the token is empty.
 */
export function persistRefreshToken(tokenPath: string, refreshToken: string): void {
  if (!refreshToken) {
    throw new Error('Refresh token is empty or invalid — nothing to persist');
  }
  const dir = path.dirname(tokenPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tokenPath, refreshToken, 'utf8');
  fs.chmodSync(tokenPath, 0o600);
}

// ── Interactive helpers ─────────────────────────────────────────────────────

async function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  execFile(cmd, [url], (err) => {
    if (err) {
      // Best-effort: if browser open fails just print the URL
    }
  });
}

// ── Main OAuth flow ─────────────────────────────────────────────────────────

async function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = req.url ?? '';
      const queryStart = reqUrl.indexOf('?');
      const queryString = queryStart >= 0 ? reqUrl.slice(queryStart + 1) : '';
      const { code } = parseCallbackQuery(queryString);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html><body>
          <h2>✅ Authorization successful</h2>
          <p>You can close this tab and return to the terminal.</p>
        </body></html>
      `);

      server.close();

      if (code) {
        resolve(code);
      } else {
        reject(new Error('OAuth callback did not contain a code parameter'));
      }
    });

    server.on('error', (err) => {
      reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
    });

    server.listen(OAUTH_PORT, OAUTH_HOST, () => {
      console.log(`\nListening for OAuth callback on http://${OAUTH_HOST}:${OAUTH_PORT}/oauth-callback`);
    });
  });
}

async function main(): Promise<void> {
  console.log('=== Gmail OAuth2 Setup ===\n');

  // 1. Load credentials
  let creds;
  try {
    creds = loadOAuthCredentials(DEFAULT_CREDENTIALS_PATH);
  } catch (err: unknown) {
    const e = err as Error;
    console.error(`\n❌ Error: ${e.message}\n`);
    process.exit(1);
  }

  // 2. Check if token already exists
  if (fs.existsSync(DEFAULT_TOKEN_PATH)) {
    const confirmed = await askConfirm(
      `\n⚠️  ${DEFAULT_TOKEN_PATH} already exists. Overwrite? (y/N): `
    );
    if (!confirmed) {
      console.log('Aborted. Existing token preserved.');
      process.exit(0);
    }
  }

  // 3. Generate authorization URL
  const authUrl = buildAuthUrl(creds.client_id, creds.client_secret);
  console.log('\n📋 Open this URL in your browser to authorize Gmail access:');
  console.log(`\n  ${authUrl}\n`);

  // 4. Try to open browser automatically
  openBrowser(authUrl);

  // 5. Wait for callback
  let code: string;
  try {
    code = await waitForCallback();
  } catch (err: unknown) {
    const e = err as Error;
    console.error(`\n❌ OAuth callback error: ${e.message}`);
    process.exit(1);
  }

  // 6. Exchange code for tokens
  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    REDIRECT_URI
  );

  let refreshToken: string;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error(
        'Google did not return a refresh_token. ' +
        'Revoke access at https://myaccount.google.com/permissions and run setup again.'
      );
    }
    refreshToken = tokens.refresh_token;
  } catch (err: unknown) {
    const e = err as Error;
    console.error(`\n❌ Token exchange failed: ${e.message}`);
    process.exit(1);
  }

  // 7. Persist refresh token
  try {
    persistRefreshToken(DEFAULT_TOKEN_PATH, refreshToken);
    console.log(`\n✅ Refresh token saved to: ${DEFAULT_TOKEN_PATH}`);
    console.log('   File permissions set to 0600 (owner read/write only).\n');
  } catch (err: unknown) {
    const e = err as Error;
    console.error(`\n❌ Failed to save token: ${e.message}`);
    process.exit(1);
  }
}

// Only run main when executed directly (not when imported by tests)
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
