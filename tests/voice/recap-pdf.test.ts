/**
 * β-15: voice memo trio (Whisper mock → NLP → PDF) tests.
 *
 * Assert-budget: ≤30 expects.
 */

import { transcribeAudio } from '@/lib/voice/whisper-transcribe';
import { extractSofFromTranscript } from '@/lib/voice/nlp-extract';
import { generateRecapPdf } from '@/lib/voice/recap-pdf';
import scenario14 from '@/lib/sample-data/demo-scenarios/14-sof-laytime-overrun.json';

describe('β-15 voice memo trio', () => {
  it('transcribeAudio falls back to deterministic mock when no API key', async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const buf = Buffer.from('fake audio');
    const out = await transcribeAudio(buf, 'audio/mpeg');
    expect(typeof out.text).toBe('string');
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.durationSec).toBeGreaterThan(0);
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it('does NOT call real Whisper API in tests (spy guard)', async () => {
    // Sanity: when API key absent, mock path is used; we additionally spy on
    // any global fetch to ensure no network call occurs.
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const fetchSpy = jest.spyOn(globalThis, 'fetch' as never);
    await transcribeAudio(Buffer.from('x'), 'audio/wav');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it('extractSofFromTranscript pulls vessel/port/laytime/events from scenario 14', () => {
    const transcript = (scenario14 as { voiceMemo: { transcript: string } }).voiceMemo.transcript;
    const expected = (scenario14 as {
      voiceMemo: { expected: Record<string, unknown> };
    }).voiceMemo.expected;
    const fields = extractSofFromTranscript(transcript);

    expect(fields.vessel).toBe(expected.vessel);
    expect(fields.port).toBe(expected.port);
    expect(fields.arrivalUtc).toBe(expected.arrivalUtc);
    expect(fields.laytimeAllowedHrs).toBe(expected.laytimeAllowedHrs);
    expect(fields.laytimeUsedHrs).toBe(expected.laytimeUsedHrs);
    expect(fields.demurrageRateUsd).toBe(expected.demurrageRateUsd);
    expect(fields.events.length).toBe(expected.eventCount);
    expect(fields.events.every((e) => typeof e.time === 'string')).toBe(true);
    expect(fields.events.every((e) => typeof e.description === 'string')).toBe(true);
  });

  it('generateRecapPdf produces a real PDF buffer with vessel name embedded', async () => {
    const transcript = (scenario14 as { voiceMemo: { transcript: string } }).voiceMemo.transcript;
    const minBytes = (scenario14 as { voiceMemo: { expectedPdfMinBytes: number } }).voiceMemo
      .expectedPdfMinBytes;
    const fields = extractSofFromTranscript(transcript);
    const buf = await generateRecapPdf(fields);

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(minBytes);
    // PDF magic bytes
    expect(buf.subarray(0, 4).toString('utf8')).toBe('%PDF');
    // With compress:false, vessel name appears as raw text in stream
    expect(buf.toString('latin1')).toContain(fields.vessel);
    expect(buf.toString('latin1')).toContain(fields.port);
  });
});
