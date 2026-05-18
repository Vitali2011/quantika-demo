/**
 * Tests for GET /api/demo-scenarios/:id
 *
 * Read-only fixture endpoint. Returns demo scenario data from JSON files.
 * No auth or DB required.
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/demo-scenarios/[id]/route';

describe('GET /api/demo-scenarios/:id', () => {
  it('returns 200 with correct shape for known id "01-karasu-mykolaiv-idle"', async () => {
    const id = '01-karasu-mykolaiv-idle';
    const req = new Request(`http://localhost/api/demo-scenarios/${id}`);
    const res = await GET(req, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(id);
    expect(typeof json.title).toBe('string');
    expect(json.cargo).toBeDefined();
    expect(json.vessel).toBeDefined();
  });

  it('returns 404 for unknown id "nonexistent"', async () => {
    const req = new Request('http://localhost/api/demo-scenarios/nonexistent');
    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('scenario not found');
  });

  it('returns 200 for another known id "05-ru-flag-mykolaiv-sanctioned" (not hardcoded to one)', async () => {
    const id = '05-ru-flag-mykolaiv-sanctioned';
    const req = new Request(`http://localhost/api/demo-scenarios/${id}`);
    const res = await GET(req, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(id);
    expect(typeof json.title).toBe('string');
  });
});
