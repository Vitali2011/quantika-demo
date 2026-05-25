/**
 * Behavioral contract tests for /api/settings/* endpoints.
 * PI2: uses real route handler imports (no string-matching), calls POST directly.
 */

import { NextRequest } from 'next/server';

function makePost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/settings/profile
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/settings/profile', () => {
  it('returns 200 with saved=true for valid displayName + email', async () => {
    const { POST } = await import('@/app/api/settings/profile/route');
    const res = await POST(makePost('http://localhost/api/settings/profile', {
      displayName: 'Vasil',
      email: 'v@example.com',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(true);
    expect(json.displayName).toBe('Vasil');
    expect(json.email).toBe('v@example.com');
  });

  it('accepts partial update — only displayName', async () => {
    const { POST } = await import('@/app/api/settings/profile/route');
    const res = await POST(makePost('http://localhost/api/settings/profile', {
      displayName: 'Vasil',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(true);
  });

  it('returns 400 for invalid email format', async () => {
    const { POST } = await import('@/app/api/settings/profile/route');
    const res = await POST(makePost('http://localhost/api/settings/profile', {
      email: 'not-an-email',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/email/i);
  });

  it('returns 400 for empty displayName string', async () => {
    const { POST } = await import('@/app/api/settings/profile/route');
    const res = await POST(makePost('http://localhost/api/settings/profile', {
      displayName: '   ',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 for non-JSON body', async () => {
    const { POST } = await import('@/app/api/settings/profile/route');
    const req = new NextRequest('http://localhost/api/settings/profile', {
      method: 'POST',
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/settings/password
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/settings/password', () => {
  it('returns 200 with saved=true for matching passwords ≥8 chars', async () => {
    const { POST } = await import('@/app/api/settings/password/route');
    const res = await POST(makePost('http://localhost/api/settings/password', {
      currentPassword: 'oldpass1',
      newPassword: 'newpass1',
      confirmPassword: 'newpass1',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(true);
  });

  it('returns 400 when passwords do not match', async () => {
    const { POST } = await import('@/app/api/settings/password/route');
    const res = await POST(makePost('http://localhost/api/settings/password', {
      currentPassword: 'oldpass1',
      newPassword: 'newpass1',
      confirmPassword: 'different',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/match/i);
  });

  it('returns 400 when new password is too short', async () => {
    const { POST } = await import('@/app/api/settings/password/route');
    const res = await POST(makePost('http://localhost/api/settings/password', {
      currentPassword: 'oldpass1',
      newPassword: 'short',
      confirmPassword: 'short',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/8 characters/i);
  });

  it('returns 400 when currentPassword is missing', async () => {
    const { POST } = await import('@/app/api/settings/password/route');
    const res = await POST(makePost('http://localhost/api/settings/password', {
      newPassword: 'newpass1',
      confirmPassword: 'newpass1',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/current password/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/settings/notifications
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/settings/notifications', () => {
  it('returns 200 with saved preferences for valid payload', async () => {
    const { POST } = await import('@/app/api/settings/notifications/route');
    const preferences = {
      new_match: true,
      email_digest: false,
      urgent_action: true,
      weekly_report: false,
    };
    const res = await POST(makePost('http://localhost/api/settings/notifications', {
      preferences,
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(true);
    expect(json.preferences).toEqual(preferences);
  });

  it('returns 400 for unknown preference key', async () => {
    const { POST } = await import('@/app/api/settings/notifications/route');
    const res = await POST(makePost('http://localhost/api/settings/notifications', {
      preferences: { unknown_key: true },
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/unknown preference/i);
  });

  it('returns 400 when preference value is not boolean', async () => {
    const { POST } = await import('@/app/api/settings/notifications/route');
    const res = await POST(makePost('http://localhost/api/settings/notifications', {
      preferences: { new_match: 'yes' },
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/boolean/i);
  });

  it('returns 400 when preferences is not an object', async () => {
    const { POST } = await import('@/app/api/settings/notifications/route');
    const res = await POST(makePost('http://localhost/api/settings/notifications', {
      preferences: ['new_match'],
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('accepts partial preferences (subset of valid keys)', async () => {
    const { POST } = await import('@/app/api/settings/notifications/route');
    const res = await POST(makePost('http://localhost/api/settings/notifications', {
      preferences: { new_match: false },
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(true);
  });
});
