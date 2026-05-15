import { google, gmail_v1 } from 'googleapis';
import pLimit from 'p-limit';

import type { Email } from './types';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google`
  );
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'online',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('No access token received');
  }

  return tokens.access_token;
}

export async function fetchGmailEmails(accessToken: string, count: number = 50): Promise<Email[]> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: count,
    q: '',
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return [];

  const limit = pLimit(10);
  const emailPromises = messages.map((msg) =>
    limit(async () => {
      try {
        const res = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });

        return parseGmailMessage(res.data);
      } catch {
        return null;
      }
    })
  );

  const results = await Promise.all(emailPromises);
  return results.filter((email): email is Email => email !== null);
}

function parseGmailMessage(message: gmail_v1.Schema$Message): Email {
  const headers = message.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || '';

  // Parse "Name <email@domain.com>" format
  function parseFromHeader(from: string): { fromName: string | null; fromEmail: string | null } {
    const match = from.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
    if (match) {
      const name = match[1].trim() || null;
      const email = match[2].trim() || null;
      return { fromName: name || null, fromEmail: email || from };
    }
    return { fromName: null, fromEmail: from };
  }

  const body = extractBody(message.payload);
  const from = getHeader('From');
  const { fromName, fromEmail } = parseFromHeader(from);

  return {
    id: message.id || '',
    threadId: message.threadId || '',
    from,
    fromName,
    fromEmail,
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    body,
    snippet: message.snippet || '',
    labelIds: message.labelIds || [],
  };
}

function extractBody(payload: gmail_v1.Schema$MessagePart | null | undefined): string {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    const textPart = payload.parts.find((part) => part.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return decodeBase64Url(textPart.body.data);
    }

    const htmlPart = payload.parts.find((part) => part.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

/** Fetch the Gmail account's own email address — used as the persistence owner key. */
export async function fetchGmailProfile(accessToken: string): Promise<string | null> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data.emailAddress ?? null;
}
