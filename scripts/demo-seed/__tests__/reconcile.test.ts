import {
  collectMentions,
  parseReconcileResponse,
  type EntityMention,
} from '../reconcile';
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
