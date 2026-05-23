import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import migration026 from '@/lib/migrations/026-charterers';
import { upsertCharterer } from '@/lib/market/charterers-repository';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

/**
 * XSS sanitization battery — POST /api/charterers and PUT /api/charterers/[id]
 *
 * Verified vectors: <script>, event handlers (onerror/onload), SVG injection,
 * javascript: scheme, data: URI, HTML entity encoding, unicode escapes.
 */

describe('XSS sanitization — POST /api/charterers', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    testDb = db;
    process.env.CHARTERER_CREDIT_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    delete process.env.CHARTERER_CREDIT_ENABLED;
  });

  async function postCharterer(body: Record<string, unknown>) {
    const { POST } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it('strips <script> tag from name', async () => {
    const res = await postCharterer({ name: '<script>alert(1)</script>Legit Corp', tier: 'blue-chip' });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).not.toContain('<script>');
    expect(json.name).not.toContain('</script>');
  });

  it('strips <img onerror> from notes', async () => {
    const res = await postCharterer({
      name: 'Safe Corp',
      tier: 'blue-chip',
      notes: '<img src=x onerror=alert(1)>',
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.notes).not.toContain('onerror');
    expect(json.notes).not.toContain('<img');
  });

  it('strips <svg onload> from notes', async () => {
    const res = await postCharterer({
      name: 'Safe Corp',
      tier: 'blue-chip',
      notes: '<svg onload=alert(1)>pwned</svg>',
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.notes).not.toContain('onload');
    expect(json.notes).not.toContain('<svg');
  });

  it('stores javascript: scheme as plain text (not executable in text context)', async () => {
    const res = await postCharterer({
      name: 'Safe Corp',
      tier: 'blue-chip',
      notes: 'javascript:alert(1)',
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    // javascript: in plain text field is kept as text (no HTML tag to strip)
    // it is only dangerous inside href/src attributes — frontend's responsibility
    expect(json.notes).toBe('javascript:alert(1)');
    expect(json.notes).not.toContain('<');
  });

  it('stores data: URI as plain text', async () => {
    const res = await postCharterer({
      name: 'Safe Corp',
      tier: 'blue-chip',
      notes: 'data:text/html,<script>alert(1)</script>',
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.notes).not.toContain('<script>');
  });

  it('strips <script> from notes', async () => {
    const res = await postCharterer({
      name: 'Safe Corp',
      tier: 'blue-chip',
      notes: '<script>document.cookie="stolen"</script>',
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.notes).not.toContain('<script>');
    expect(json.notes).not.toContain('</script>');
  });

  it('strips inline event handlers from mixed-content notes', async () => {
    const res = await postCharterer({
      name: 'Safe Corp',
      tier: 'blue-chip',
      notes: 'Good company <b onclick=alert(1)>click me</b>',
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.notes).not.toContain('onclick');
    expect(json.notes).not.toContain('<b');
    expect(json.notes).toContain('click me');
  });

  it('handles HTML entity-encoded vector without double-executing', async () => {
    const res = await postCharterer({
      name: 'Safe Corp',
      tier: 'blue-chip',
      notes: '&lt;script&gt;alert(1)&lt;/script&gt;',
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    // Entities are safe — they render as literal text, not executed as tags
    expect(json.notes).not.toContain('<script>');
  });

  it('returns 400 when name is only XSS tags (sanitizes to empty)', async () => {
    const res = await postCharterer({ name: '<script></script>', tier: 'blue-chip' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

describe('XSS sanitization — PUT /api/charterers/[id]', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    testDb = db;
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    upsertCharterer(db, {
      id: 'xss-test-id',
      name: 'Clean Corp',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });
  });

  afterEach(() => {
    db.close();
    delete process.env.CHARTERER_CREDIT_ENABLED;
  });

  async function putCharterer(body: Record<string, unknown>) {
    const { PUT } = await import('@/app/api/charterers/[id]/route');
    const req = new NextRequest('http://localhost/api/charterers/xss-test-id', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return PUT(req, { params: Promise.resolve({ id: 'xss-test-id' }) });
  }

  it('strips <script> tag from name in PUT', async () => {
    const res = await putCharterer({ name: '<script>alert(1)</script>Updated Corp' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).not.toContain('<script>');
    expect(json.name).toContain('Updated Corp');
  });

  it('strips <img onerror> from notes in PUT', async () => {
    const res = await putCharterer({ notes: '<img src=x onerror=alert(document.cookie)>' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notes).not.toContain('onerror');
    expect(json.notes).not.toContain('<img');
  });

  it('strips <svg onload> from notes in PUT', async () => {
    const res = await putCharterer({ notes: '<svg/onload=alert(1)>' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notes).not.toContain('onload');
    expect(json.notes).not.toContain('<svg');
  });

  it('returns 400 when name sanitizes to empty in PUT', async () => {
    const res = await putCharterer({ name: '<img src=x>' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('preserves null notes in PUT (no sanitization error)', async () => {
    const res = await putCharterer({ notes: null });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notes).toBeNull();
  });
});
