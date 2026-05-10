/**
 * Tests for lib/corpus/mime-decode.ts
 * Pure unit tests — no network, no LLM.
 */

import {
  decodeBase64Url,
  extractTextPart,
  extractHeaders,
  parseFromHeader,
  GmailPayload,
} from '../mime-decode';

// ---------------------------------------------------------------------------
// decodeBase64Url
// ---------------------------------------------------------------------------

describe('decodeBase64Url', () => {
  it('decodes standard base64url string', () => {
    // "Hello" in base64url
    const encoded = Buffer.from('Hello').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    expect(decodeBase64Url(encoded)).toBe('Hello');
  });

  it('handles base64url with - and _ characters (no + or /)', () => {
    // Craft a string that produces + and / in standard base64
    // "Hello+World/Test" → encodes with + and / in base64
    const raw = 'Hello+World/Test';
    const base64Standard = Buffer.from(raw).toString('base64');
    // Convert to base64url
    const base64url = base64Standard.replace(/\+/g, '-').replace(/\//g, '_');
    expect(decodeBase64Url(base64url)).toBe(raw);
  });

  it('decodes Gmail fixture body — plain text with forwarded message', () => {
    const data =
      'UGxlYXNlIHNlZSB0aGUgZm9yd2FyZGVkIGlucXVpcnkgYmVsb3cuCgotLS0tLS0tLS0tIEZvcndhcmRlZCBtZXNzYWdlIC0tLS0tLS0tLS0KRnJvbTogY2FyZ29Ac2hpcHBlci5jb20KRGF0ZTogRnJpLCAwMiBNYXkgMjAyNiAwODowMDowMCArMDAwMApTdWJqZWN0OiBCdWxrIGNhcmdvIHF1ZXJ5ClRvOiBmb3J3YXJkZXJAZXhhbXBsZS5jb20KCkRlYXIgRm9yd2FyZGVyLAoKV2UgbmVlZCB0byBzaGlwIDEwMDAwbXQgb2YgZ3JhaW4gZnJvbSBPZGVzc2EgdG8gUm90dGVyZGFtLgoKQmVzdCByZWdhcmRzLApDYXJnbyBUZWFt';
    const decoded = decodeBase64Url(data);
    expect(decoded).toContain('Please see the forwarded inquiry below.');
    expect(decoded).toContain('Forwarded message');
    expect(decoded).toContain('cargo@shipper.com');
  });

  it('decodes empty string to empty string', () => {
    expect(decodeBase64Url('')).toBe('');
  });

  it('decodes UTF-8 multibyte chars correctly', () => {
    const original = 'Привет мир';
    const encoded = Buffer.from(original, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(decodeBase64Url(encoded)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// extractTextPart
// ---------------------------------------------------------------------------

describe('extractTextPart', () => {
  it('extracts text from single-part text/plain', () => {
    const payload: GmailPayload = {
      mimeType: 'text/plain',
      body: { data: Buffer.from('Hello plain').toString('base64') },
    };
    expect(extractTextPart(payload)).toBe('Hello plain');
  });

  it('prefers text/plain over text/html in multipart/alternative', () => {
    const plainData = Buffer.from('Plain text content').toString('base64');
    const htmlData = Buffer.from('<html><body><p>HTML content</p></body></html>').toString('base64');
    const payload: GmailPayload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: plainData } },
        { mimeType: 'text/html', body: { data: htmlData } },
      ],
    };
    const text = extractTextPart(payload);
    expect(text).toBe('Plain text content');
    expect(text).not.toContain('<html>');
  });

  it('falls back to stripped text/html when no text/plain in multipart/alternative', () => {
    const htmlData = Buffer.from('<html><body><p>HTML only content</p></body></html>').toString('base64');
    const payload: GmailPayload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: htmlData } },
      ],
    };
    const text = extractTextPart(payload);
    expect(text).toContain('HTML only content');
    expect(text).not.toContain('<html>');
    expect(text).not.toContain('<p>');
  });

  it('skips attachment parts in multipart/mixed and takes text', () => {
    const plainData = Buffer.from('This is the message text').toString('base64');
    const payload: GmailPayload = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: plainData } },
        {
          mimeType: 'application/pdf',
          body: { data: Buffer.from('fake-pdf-binary').toString('base64'), size: 1234 },
        },
      ],
    };
    const text = extractTextPart(payload);
    expect(text).toBe('This is the message text');
  });

  it('recurses into nested multipart children', () => {
    const innerPlainData = Buffer.from('Deep nested text').toString('base64');
    const payload: GmailPayload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: innerPlainData } },
          ],
        },
        { mimeType: 'application/octet-stream', body: { size: 100 } },
      ],
    };
    const text = extractTextPart(payload);
    expect(text).toBe('Deep nested text');
  });

  it('returns empty string when payload has no body data', () => {
    const payload: GmailPayload = {
      mimeType: 'text/plain',
      body: { size: 0 },
    };
    expect(extractTextPart(payload)).toBe('');
  });

  it('returns empty string for empty parts array', () => {
    const payload: GmailPayload = {
      mimeType: 'multipart/alternative',
      parts: [],
    };
    expect(extractTextPart(payload)).toBe('');
  });

  it('returns empty string for null/undefined payload', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(extractTextPart(null as any)).toBe('');
  });

  it('handles base64url with - and _ chars in body data', () => {
    // Construct data that produces - or _ in base64url
    // Use the Apple Mail fixture (known to work)
    const data =
      'RllJIHBsZWFzZSBoYW5kbGUgdGhpcy4KCkJlZ2luIGZvcndhcmRlZCBtZXNzYWdlOgpGcm9tOiBjbGllbnRAYXJhYnRyYWRlcnMuYWUKRGF0ZTogVGh1cnNkYXksIDEgTWF5IDIwMjYgYXQgMDk6MzA6MDAgR01UClN1YmplY3Q6IFZlc3NlbCBjaGFydGVyIHJlcXVlc3QKVG86IGJyb2tlckBxdWFudGlrYS5jb20KCkhpLAoKV2UgYXJlIGxvb2tpbmcgdG8gY2hhcnRlciBhIFBhbmFtYXggdmVzc2VsIGZvciBhIGNvYWwgY2FyZ28uCgpSZWdhcmRz';
    const payload: GmailPayload = {
      mimeType: 'text/plain',
      body: { data },
    };
    const text = extractTextPart(payload);
    expect(text).toContain('Begin forwarded message:');
    expect(text).toContain('client@arabtraders.ae');
  });
});

// ---------------------------------------------------------------------------
// extractHeaders
// ---------------------------------------------------------------------------

describe('extractHeaders', () => {
  it('extracts headers as lowercase-keyed Map', () => {
    const payload: GmailPayload = {
      headers: [
        { name: 'From', value: 'John <john@example.com>' },
        { name: 'To', value: 'sales@quantika.com' },
        { name: 'Subject', value: 'Test subject' },
      ],
    };
    const headers = extractHeaders(payload);
    expect(headers.get('from')).toBe('John <john@example.com>');
    expect(headers.get('to')).toBe('sales@quantika.com');
    expect(headers.get('subject')).toBe('Test subject');
  });

  it('joins duplicate headers with "; "', () => {
    const payload: GmailPayload = {
      headers: [
        { name: 'Received', value: 'from mx1.example.com' },
        { name: 'Received', value: 'from mx2.example.com' },
      ],
    };
    const headers = extractHeaders(payload);
    expect(headers.get('received')).toBe('from mx1.example.com; from mx2.example.com');
  });

  it('returns empty Map for payload without headers', () => {
    const payload: GmailPayload = {};
    const headers = extractHeaders(payload);
    expect(headers.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseFromHeader
// ---------------------------------------------------------------------------

describe('parseFromHeader', () => {
  it('parses "Name <email>" format', () => {
    const result = parseFromHeader('John Smith <john@forwarder.com>');
    expect(result.fromName).toBe('John Smith');
    expect(result.fromEmail).toBe('john@forwarder.com');
  });

  it('parses "<email>" format without name', () => {
    const result = parseFromHeader('<jane@example.com>');
    expect(result.fromName).toBeNull();
    expect(result.fromEmail).toBe('jane@example.com');
  });

  it('parses plain email address', () => {
    const result = parseFromHeader('agent@forwarder.com');
    expect(result.fromName).toBeNull();
    expect(result.fromEmail).toBe('agent@forwarder.com');
  });

  it('strips quotes from display name', () => {
    const result = parseFromHeader('"Cargo Team" <cargo@shipper.com>');
    expect(result.fromName).toBe('Cargo Team');
    expect(result.fromEmail).toBe('cargo@shipper.com');
  });

  it('returns nulls for empty string', () => {
    const result = parseFromHeader('');
    expect(result.fromName).toBeNull();
    expect(result.fromEmail).toBeNull();
  });
});
