import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SAMPLE_DIR = path.join(ROOT, 'lib/sample-data');
const EXPECTED_PATH = path.join(ROOT, '__tests__/fixtures/test-suite-50/expected.json');
const PORT_MASTER_PATH = path.join(ROOT, 'data/ports/port-master.json');

type EmailFile = {
  id: string;
  threadId: string;
  from: string;
  fromEmail?: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  snippet: string;
  labelIds: string[];
};

type Expected = {
  id: string;
  category: string;
  status?: string;
  test_category: string;
  extracted?: Record<string, unknown>;
  hard_filters?: Record<string, unknown>;
  match_expectation?: Record<string, unknown>;
  adversarial_expectation?: Record<string, unknown> | null;
  notes?: string;
};

const FILES = [
  'cargo-inquiries.json',
  'vessel-positions.json',
  'fixture-recaps.json',
  'client-replies.json',
] as const;

function loadEmails(): EmailFile[] {
  return FILES.flatMap((f) => {
    const arr = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, f), 'utf-8')) as EmailFile[];
    return arr;
  });
}

function loadExpected(): Expected[] {
  return JSON.parse(fs.readFileSync(EXPECTED_PATH, 'utf-8')) as Expected[];
}

function imoChecksumValid(imo: string): boolean {
  if (!/^\d{7}$/.test(imo)) return false;
  const digits = imo.split('').map(Number);
  const sum = digits.slice(0, 6).reduce((acc, d, i) => acc + d * (7 - i), 0);
  return sum % 10 === digits[6];
}

describe('test-suite-50: structural integrity', () => {
  const emails = loadEmails();
  const expected = loadExpected();
  const emailById = new Map(emails.map((e) => [e.id, e]));
  const expectedById = new Map(expected.map((e) => [e.id, e]));

  it('loads at least 50 sample emails across 4 JSON files (corpus expanded for Wave β/γ)', () => {
    expect(emails.length).toBeGreaterThanOrEqual(50);
  });

  it('has expected.json with at least 50 entries (75 after Wave-corpus expansion)', () => {
    expect(expected.length).toBeGreaterThanOrEqual(50);
  });

  it('email ids include the original sample-01..sample-50 set without duplicates', () => {
    const ids = new Set(emails.map((e) => e.id));
    expect(ids.size).toBe(emails.length);
    for (let i = 1; i <= 50; i++) {
      expect(ids.has(`sample-${String(i).padStart(2, '0')}`)).toBe(true);
    }
  });

  it('every expected entry has a matching email', () => {
    const missing = expected.filter((e) => !emailById.has(e.id)).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('every email has required gmail-api shape', () => {
    for (const e of emails) {
      expect(e).toMatchObject({
        id: expect.stringMatching(/^sample-\d{2,3}$/),
        threadId: expect.any(String),
        from: expect.any(String),
        to: expect.any(String),
        subject: expect.any(String),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        body: expect.any(String),
        snippet: expect.any(String),
        labelIds: expect.arrayContaining(['INBOX']),
      });
    }
  });

  it('every expected entry has category + test_category', () => {
    const valid_cat = new Set([
      'CARGO_INQUIRY',
      'VESSEL_POSITION',
      'FIXTURE_RECAP',
      'CLIENT_REPLY',
      'TCT_REQUEST',
      'OTHER',
      'DOCUMENT',
      'VESSEL_CERTIFICATE',
    ]);
    for (const x of expected) {
      expect(valid_cat.has(x.category)).toBe(true);
      expect(x.test_category).toEqual(expect.any(String));
    }
  });
});

describe('test-suite-50: vessel IMO checksums', () => {
  const expected = loadExpected();
  const vessels = expected.filter((x) => x.category === 'VESSEL_POSITION');

  it('imo_valid_checksum flag matches mod-10 algorithm', () => {
    for (const v of vessels) {
      const ex = v.extracted as { imo?: string; imo_valid_checksum?: boolean } | undefined;
      if (!ex?.imo) continue;
      const actual = imoChecksumValid(ex.imo);
      expect({
        id: v.id,
        imo: ex.imo,
        flag: ex.imo_valid_checksum,
        actual,
      }).toMatchObject({ flag: actual });
    }
  });

  it('has at least one adversarial vessel with invalid IMO', () => {
    const invalid = vessels.filter(
      (v) => (v.extracted as { imo_valid_checksum?: boolean })?.imo_valid_checksum === false,
    );
    expect(invalid.length).toBeGreaterThanOrEqual(1);
  });
});

describe('test-suite-50: distribution', () => {
  const expected = loadExpected();

  it('test_category distribution covers clean/edge/adversarial/impossible', () => {
    const counts = new Map<string, number>();
    for (const x of expected) counts.set(x.test_category, (counts.get(x.test_category) ?? 0) + 1);
    expect(counts.get('clean') ?? 0).toBeGreaterThanOrEqual(18);
    expect(counts.get('edge') ?? 0).toBeGreaterThanOrEqual(8);
    expect((counts.get('adversarial') ?? 0) + (counts.get('impossible') ?? 0)).toBeGreaterThanOrEqual(6);
  });

  it('category distribution covers all email kinds (corpus expanded for Wave β/γ)', () => {
    const cats = new Map<string, number>();
    for (const x of expected) cats.set(x.category, (cats.get(x.category) ?? 0) + 1);
    const cargoLike = (cats.get('CARGO_INQUIRY') ?? 0) + (cats.get('TCT_REQUEST') ?? 0);
    expect(cargoLike).toBeGreaterThanOrEqual(25);
    expect(cats.get('VESSEL_POSITION') ?? 0).toBeGreaterThanOrEqual(14);
    expect(cats.get('FIXTURE_RECAP') ?? 0).toBeGreaterThanOrEqual(8);
    const clientOther =
      (cats.get('CLIENT_REPLY') ?? 0) +
      (cats.get('OTHER') ?? 0) +
      (cats.get('DOCUMENT') ?? 0) +
      (cats.get('VESSEL_CERTIFICATE') ?? 0);
    expect(clientOther).toBeGreaterThanOrEqual(3);
  });
});

describe('test-suite-50: intentionally missing ports', () => {
  const portMaster = JSON.parse(fs.readFileSync(PORT_MASTER_PATH, 'utf-8')) as Array<{
    unlocode: string;
    name: string;
  }>;
  const known = new Set(portMaster.map((p) => p.name.toLowerCase()));

  const MISSING_ON_PURPOSE = ['onega', 'probolinggo', 'kastanpole'];

  it('deliberately missing ports are NOT in port-master (they test LLM fallback)', () => {
    for (const p of MISSING_ON_PURPOSE) {
      expect(known.has(p)).toBe(false);
    }
  });
});
