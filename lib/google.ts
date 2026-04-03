/* eslint-disable @typescript-eslint/no-explicit-any */
import { google } from 'googleapis';

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

  const emailPromises = messages.map(async (msg) => {
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
  });

  const results = await Promise.all(emailPromises);
  return results.filter((email): email is Email => email !== null);
}

function parseGmailMessage(message: any): Email {
  const headers = message.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((header: any) => header.name.toLowerCase() === name.toLowerCase())?.value || '';

  const body = extractBody(message.payload);

  return {
    id: message.id || '',
    threadId: message.threadId || '',
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    body,
    snippet: message.snippet || '',
  };
}

function extractBody(payload: any): string {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    const textPart = payload.parts.find((part: any) => part.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return decodeBase64Url(textPart.body.data);
    }

    const htmlPart = payload.parts.find((part: any) => part.mimeType === 'text/html');
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
