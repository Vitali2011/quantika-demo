/**
 * Tests for lib/corpus/build.ts
 * Uses fixture JSON files from __tests__/fixtures/.
 */

import path from 'path';
import fs from 'fs';
import { buildCorpusFromThreads, RawThread } from '../build';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name: string): RawThread {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RawThread;
}

// ---------------------------------------------------------------------------
// thread-plain.json
// ---------------------------------------------------------------------------

describe('buildCorpusFromThreads — thread-plain', () => {
  const thread = loadFixture('thread-plain.json');

  it('produces one Email for a single-message plain thread', () => {
    const emails = buildCorpusFromThreads([thread]);
    expect(emails).toHaveLength(1);
  });

  it('maps id and threadId correctly', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.id).toBe('msg-001');
    expect(email.threadId).toBe('thread-001');
  });

  it('extracts From header into from/fromName/fromEmail', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.fromName).toBe('John Smith');
    expect(email.fromEmail).toBe('john@forwarder.com');
    expect(email.from).toContain('john@forwarder.com');
  });

  it('extracts To, Subject headers', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.to).toBe('sales@quantika.com');
    expect(email.subject).toBe('Cargo inquiry - steel coils');
  });

  it('returns date as ISO string', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('decodes body from base64url', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.body).toContain('Hello, I need a quote for 5000mt of steel coils.');
  });

  it('uses Gmail-provided snippet when available', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.snippet).toBe('Hello, I need a quote for 5000mt of steel coils.');
  });

  it('carries labelIds array', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.labelIds).toContain('INBOX');
    expect(email.labelIds).toContain('UNREAD');
  });

  it('has no forwarding — layerCount=0 — body is original', () => {
    const [email] = buildCorpusFromThreads([thread]);
    // No forward marker in body
    expect(email.body).not.toContain('Forwarded message');
  });
});

// ---------------------------------------------------------------------------
// thread-forwarded-gmail.json
// ---------------------------------------------------------------------------

describe('buildCorpusFromThreads — thread-forwarded-gmail', () => {
  const thread = loadFixture('thread-forwarded-gmail.json');

  it('produces one Email', () => {
    const emails = buildCorpusFromThreads([thread]);
    expect(emails).toHaveLength(1);
  });

  it('extracts original sender from forwarded content', () => {
    const [email] = buildCorpusFromThreads([thread]);
    // The original sender is cargo@shipper.com from the forwarded layer
    expect(email.from).toContain('cargo@shipper.com');
    expect(email.fromEmail).toBe('cargo@shipper.com');
  });

  it('uses original subject from forwarded layer', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.subject).toBe('Bulk cargo query');
  });

  it('body is the innermost message content', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.body).toContain('We need to ship 10000mt of grain');
    // Outer wrapping text should NOT appear in the innermost body
    expect(email.body).not.toContain('Please see the forwarded inquiry below');
  });

  it('has Gmail-provided snippet', () => {
    const [email] = buildCorpusFromThreads([thread]);
    expect(email.snippet).toBe('Please see the forwarded inquiry below.');
  });
});

// ---------------------------------------------------------------------------
// thread-forwarded-apple.json (multipart, 2 messages in thread)
// ---------------------------------------------------------------------------

describe('buildCorpusFromThreads — thread-forwarded-apple', () => {
  const thread = loadFixture('thread-forwarded-apple.json');

  it('produces two Emails for a two-message thread', () => {
    const emails = buildCorpusFromThreads([thread]);
    expect(emails).toHaveLength(2);
  });

  it('first email: extracts original Apple Mail forwarded sender', () => {
    const emails = buildCorpusFromThreads([thread]);
    const first = emails.find((e) => e.id === 'msg-003a');
    expect(first).toBeDefined();
    // Apple Mail forward from client@arabtraders.ae
    expect(first!.fromEmail).toBe('client@arabtraders.ae');
    // subject should be from unwrapped forward
    expect(first!.subject).toBe('Vessel charter request');
  });

  it('first email: body is inner forwarded content', () => {
    const emails = buildCorpusFromThreads([thread]);
    const first = emails.find((e) => e.id === 'msg-003a')!;
    expect(first.body).toContain('Panamax vessel');
    expect(first.body).not.toContain('FYI please handle');
  });

  it('second email: plain reply has correct from', () => {
    const emails = buildCorpusFromThreads([thread]);
    const second = emails.find((e) => e.id === 'msg-003b')!;
    expect(second.fromEmail).toBe('ops@quantika.com');
    expect(second.body).toContain('On it, will contact the client.');
  });

  it('all required Email fields are present and non-undefined', () => {
    const emails = buildCorpusFromThreads([thread]);
    for (const email of emails) {
      expect(typeof email.id).toBe('string');
      expect(typeof email.threadId).toBe('string');
      expect(typeof email.from).toBe('string');
      expect(typeof email.to).toBe('string');
      expect(typeof email.subject).toBe('string');
      expect(typeof email.date).toBe('string');
      expect(typeof email.body).toBe('string');
      expect(typeof email.snippet).toBe('string');
      expect(Array.isArray(email.labelIds)).toBe(true);
      // fromName and fromEmail can be null
      expect(email.fromName === null || typeof email.fromName === 'string').toBe(true);
      expect(email.fromEmail === null || typeof email.fromEmail === 'string').toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Multiple threads
// ---------------------------------------------------------------------------

describe('buildCorpusFromThreads — multiple threads', () => {
  it('accumulates emails from all threads', () => {
    const plain = loadFixture('thread-plain.json');
    const gmail = loadFixture('thread-forwarded-gmail.json');
    const apple = loadFixture('thread-forwarded-apple.json');

    const emails = buildCorpusFromThreads([plain, gmail, apple]);
    // 1 + 1 + 2 = 4
    expect(emails).toHaveLength(4);
  });

  it('returns empty array for empty threads input', () => {
    expect(buildCorpusFromThreads([])).toHaveLength(0);
  });

  it('skips threads with no messages', () => {
    const emptyThread: RawThread = { id: 'empty-thread', messages: [] };
    const emails = buildCorpusFromThreads([emptyThread]);
    expect(emails).toHaveLength(0);
  });

  it('skips messages with no payload', () => {
    const thread: RawThread = {
      id: 'thread-no-payload',
      messages: [
        { id: 'msg-no-payload', threadId: 'thread-no-payload' },
      ],
    };
    const emails = buildCorpusFromThreads([thread]);
    expect(emails).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// snippet generation
// ---------------------------------------------------------------------------

describe('buildCorpusFromThreads — snippet', () => {
  it('generates snippet from body when Gmail snippet is missing', () => {
    const thread: RawThread = {
      id: 'thread-snippet',
      messages: [
        {
          id: 'msg-snippet',
          threadId: 'thread-snippet',
          // No snippet field
          labelIds: ['INBOX'],
          payload: {
            mimeType: 'text/plain',
            headers: [
              { name: 'From', value: 'test@example.com' },
              { name: 'To', value: 'sales@quantika.com' },
              { name: 'Subject', value: 'Test' },
              { name: 'Date', value: 'Mon, 06 May 2026 10:00:00 +0000' },
            ],
            body: {
              data: Buffer.from('A'.repeat(300)).toString('base64'),
            },
          },
        },
      ],
    };

    const [email] = buildCorpusFromThreads([thread]);
    expect(email.snippet.length).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// date fallback
// ---------------------------------------------------------------------------

describe('buildCorpusFromThreads — date fallback', () => {
  it('falls back to internalDate when no Date header', () => {
    const internalDate = '1746518400000';
    const thread: RawThread = {
      id: 'thread-date',
      messages: [
        {
          id: 'msg-date',
          threadId: 'thread-date',
          internalDate,
          labelIds: [],
          payload: {
            mimeType: 'text/plain',
            headers: [
              { name: 'From', value: 'a@b.com' },
              { name: 'To', value: 'c@d.com' },
              { name: 'Subject', value: 'No date header' },
            ],
            body: { data: Buffer.from('body text').toString('base64') },
          },
        },
      ],
    };

    const [email] = buildCorpusFromThreads([thread]);
    const expected = new Date(parseInt(internalDate, 10)).toISOString();
    expect(email.date).toBe(expected);
  });
});
