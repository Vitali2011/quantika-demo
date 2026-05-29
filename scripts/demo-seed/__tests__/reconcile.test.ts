import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {
  collectMentions,
  parseReconcileResponse,
  type EntityMention,
} from '../reconcile';
import { writeReconcileCache, readReconcileCache } from '../reconcile-cache';
import type { LlmCache } from '../llm-cache';

function emptyCache(): LlmCache {
  return {
    corpusHash: 'h', generatedAt: '2026-05-27T00:00:00.000Z',
    classifications: [], parsedCargos: [], parsedVessels: [], parsedFixtureRecaps: [],
  };
}

describe('collectMentions', () => {
  it('pulls vessel names and recap parties as mentions', () => {
    const cache = emptyCache();
    cache.parsedVessels = [{ emailId: 'e1', itemIndex: 0, vesselName: { value: 'M/V SPRING WIND', confidence: 'confirmed', source_text: 'x' } } as any];
    cache.parsedFixtureRecaps = [{ emailId: 'e2', charterers: { value: 'KORNAS LTD', confidence: 'confirmed', source_text: 'y' }, broker: 'ETM Services' } as any];
    const m = collectMentions(cache);
    expect(m).toEqual(expect.arrayContaining([
      { kind: 'vessel', raw: 'M/V SPRING WIND', emailId: 'e1' },
      { kind: 'charterer', raw: 'KORNAS LTD', emailId: 'e2' },
      { kind: 'broker', raw: 'ETM Services', emailId: 'e2' },
    ]));
  });
});

describe('parseReconcileResponse', () => {
  const mentions: EntityMention[] = [
    { kind: 'vessel', raw: 'M/V SPRING WIND', emailId: 'e1' },
    { kind: 'vessel', raw: 'SPRING WIND', emailId: 'e3' },
    { kind: 'charterer', raw: 'KORNAS LTD', emailId: 'e2' },
  ];
  const opusJson = JSON.stringify({
    groups: [
      { kind: 'vessel', canonical: 'M/V SPRING WIND', aliases: ['M/V SPRING WIND', 'SPRING WIND'] },
      { kind: 'charterer', canonical: 'KORNAS LTD', aliases: ['KORNAS LTD'] },
    ],
    conflicts: [],
  });

  it('assigns deterministic pseudonyms by first-appearance order', () => {
    const r = parseReconcileResponse(opusJson, mentions);
    expect(r.anonymization.vessels['M/V SPRING WIND']).toBe('M/V SEAGULL 1');
    expect(r.anonymization.vessels['SPRING WIND']).toBe('M/V SEAGULL 1');
    expect(r.anonymization.charterers['KORNAS LTD']).toBe('GRAIN TRADER A');
  });

  it('is stable across repeated runs', () => {
    const a = parseReconcileResponse(opusJson, mentions);
    const b = parseReconcileResponse(opusJson, mentions);
    expect(a.anonymization).toEqual(b.anonymization);
  });
});

describe('reconcile-cache', () => {
  it('round-trips raw grouping json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
    try {
      writeReconcileCache(dir, 'abc', '{"groups":[],"conflicts":[]}');
      expect(readReconcileCache(dir, 'abc')).toBe('{"groups":[],"conflicts":[]}\n');
      expect(readReconcileCache(dir, 'missing')).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reconcile QA hardening (adversarial findings)', () => {
  it('LEAK GUARD: auto-anonymizes a mention Opus dropped from its grouping', () => {
    const mentions: EntityMention[] = [
      { kind: 'vessel', raw: 'M/V GROUPED', emailId: 'e1' },
      { kind: 'charterer', raw: 'DROPPED CORP', emailId: 'e2' },
    ];
    // Opus grouped only the vessel; "DROPPED CORP" omitted entirely.
    const opusJson = JSON.stringify({
      groups: [{ kind: 'vessel', canonical: 'M/V GROUPED', aliases: ['M/V GROUPED'] }],
      conflicts: [],
    });
    const r = parseReconcileResponse(opusJson, mentions);
    expect(r.anonymization.charterers['DROPPED CORP']).toMatch(/^GRAIN TRADER /);
    expect(r.conflicts.some((c) => c.includes('DROPPED CORP'))).toBe(true);
  });

  it('charterer pseudonyms never break past Z (27th = AA)', () => {
    const mentions: EntityMention[] = Array.from({ length: 27 }, (_, i) => ({
      kind: 'charterer' as const,
      raw: `C${i}`,
      emailId: `e${i}`,
    }));
    const groups = mentions.map((m) => ({ kind: 'charterer', canonical: m.raw, aliases: [m.raw] }));
    const r = parseReconcileResponse(JSON.stringify({ groups, conflicts: [] }), mentions);
    expect(r.anonymization.charterers['C0']).toBe('GRAIN TRADER A');
    expect(r.anonymization.charterers['C25']).toBe('GRAIN TRADER Z');
    expect(r.anonymization.charterers['C26']).toBe('GRAIN TRADER AA');
  });

  it('throws a clear error on malformed Opus JSON / missing groups', () => {
    expect(() => parseReconcileResponse('not json', [])).toThrow(/invalid JSON/);
    expect(() => parseReconcileResponse('{"conflicts":[]}', [])).toThrow(/missing "groups"/);
  });

  it('duplicate alias across groups keeps first pseudonym + records conflict', () => {
    const mentions: EntityMention[] = [{ kind: 'vessel', raw: 'AMBIG', emailId: 'e1' }];
    const opusJson = JSON.stringify({
      groups: [
        { kind: 'vessel', canonical: 'AMBIG ONE', aliases: ['AMBIG'] },
        { kind: 'vessel', canonical: 'AMBIG TWO', aliases: ['AMBIG'] },
      ],
      conflicts: [],
    });
    const r = parseReconcileResponse(opusJson, mentions);
    expect(r.anonymization.vessels['AMBIG']).toBe('M/V SEAGULL 1');
    expect(r.conflicts.some((c) => /overlap/i.test(c))).toBe(true);
  });

  it('collectMentions dedupes an identical charterer===account mention', () => {
    const cache = emptyCache();
    cache.parsedFixtureRecaps = [
      {
        emailId: 'e1',
        charterers: { value: 'ACME', confidence: 'confirmed', source_text: 'x' },
        account: { value: 'ACME', confidence: 'confirmed', source_text: 'x' },
      } as any,
    ];
    const m = collectMentions(cache);
    expect(m.filter((x) => x.raw === 'ACME' && x.emailId === 'e1')).toHaveLength(1);
  });
});
