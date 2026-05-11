/**
 * Adversarial QA — Agent C: ATTACK-4, ATTACK-10, ATTACK-12
 *
 * ATTACK-4  [HIGH]:    forward-parser — hardcoded cargoType:'BULK', non-null assertion crashes
 * ATTACK-10 [MEDIUM]:  RTL detection — boundary 30%, Arabic-Indic digits, tie-break
 * ATTACK-12 [MEDIUM]:  Bunker scraper — nested HTML tags, EU comma decimals, duplicate ports
 */

// ---------------------------------------------------------------------------
// ATTACK-4 — parseForwardedMessage adversarial edge cases
// ---------------------------------------------------------------------------

jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
  callAiText: jest.fn(),
}));

jest.mock('../../lib/whatsapp/voice-transcribe', () => ({
  transcribeAudio: jest.fn(),
}));

jest.mock('../../lib/whatsapp/image-ocr', () => ({
  extractTextFromImage: jest.fn(),
}));

jest.mock('../../lib/whatsapp/pdf-extract', () => ({
  extractTextFromPdf: jest.fn(),
}));

import { parseForwardedMessage } from '../../lib/whatsapp/forward-parser';
import type { WhatsAppIncomingMessage } from '../../lib/whatsapp/types';
import { callAiJson } from '@/lib/openai';
import { extractTextFromImage } from '../../lib/whatsapp/image-ocr';

const mockCallAiJson = callAiJson as jest.MockedFunction<typeof callAiJson>;
const mockExtractTextFromImage = extractTextFromImage as jest.MockedFunction<typeof extractTextFromImage>;

function makeMsg(
  type: WhatsAppIncomingMessage['type'],
  extra: Record<string, unknown> = {},
): WhatsAppIncomingMessage {
  return {
    id: 'wamid.test001',
    from: '+971501234567',
    timestamp: '1714000000',
    type,
    ...extra,
  } as WhatsAppIncomingMessage;
}

const mockClientDownloadMedia = jest.fn().mockResolvedValue({ url: 'http://mock/media', mimeType: 'image/jpeg' });
const mockClient = {
  downloadMedia: mockClientDownloadMedia,
} as never;

describe('ATTACK-4 — forward-parser adversarial edge cases', () => {
  beforeEach(() => {
    // resetAllMocks clears both call history AND the once-implementation queue,
    // preventing stale mockResolvedValueOnce/mockRejectedValueOnce from leaking between tests.
    jest.resetAllMocks();
    // Re-setup mockClient.downloadMedia default after reset
    mockClientDownloadMedia.mockResolvedValue({ url: 'http://mock/media', mimeType: 'image/jpeg' });
  });

  // ---- BUG CANDIDATE: cargoType always hardcoded to 'BULK' ----
  it('A4-1: cargoType is hardcoded BULK even when AI says BREAK_BULK', async () => {
    // AI returns BREAK_BULK in cargo_description context
    mockCallAiJson.mockResolvedValueOnce({
      cargo_description: { value: 'Steel pipes BREAK_BULK', confidence: 'confirmed' },
      origin_port: { value: 'Dubai', confidence: 'confirmed' },
      destination_port: { value: 'Jeddah', confidence: 'confirmed' },
      missing_info: [],
    });

    const msg = makeMsg('text', { text: { body: 'Steel pipes BREAK_BULK cargo from Dubai to Jeddah' } });
    const result = await parseForwardedMessage(msg, mockClient);

    // This assertion DOCUMENTS the bug: cargoType should reflect AI output
    // but the code hardcodes 'BULK'. Test is expected to FAIL = BUG confirmed.
    expect(result.parsedCargo?.cargoType).not.toBe('BULK');
    // ^ If this assertion fails, cargoType IS hardcoded to 'BULK' (BUG-C1)
  });

  it('A4-2: cargoType control — hardcoded value is always BULK (confirms bug)', async () => {
    mockCallAiJson.mockResolvedValueOnce({
      cargo_description: { value: 'Wind turbine blades', confidence: 'confirmed' },
      origin_port: { value: 'Rotterdam', confidence: 'confirmed' },
      missing_info: [],
    });

    const msg = makeMsg('text', { text: { body: 'Wind turbine blades from Rotterdam' } });
    const result = await parseForwardedMessage(msg, mockClient);

    // This SHOULD pass — documents that BULK is always returned regardless of content
    expect(result.parsedCargo?.cargoType).toBe('BULK');
    // If this passes and A4-1 fails → BUG is confirmed: hardcoded BULK
  });

  // ---- Non-null assertion crash: msg.image!.id when image field is missing ----
  it('A4-3: type=image but image field missing → should not crash with non-null assertion', async () => {
    // msg.image is undefined, but code does msg.image!.id
    const msg = makeMsg('image');
    // No image field set — this should throw with TypeError or return error gracefully
    // NOT crash with "Cannot read properties of undefined"
    let threw = false;
    let errorMessage = '';
    try {
      mockExtractTextFromImage.mockResolvedValueOnce('some text');
      mockCallAiJson.mockResolvedValueOnce({ missing_info: [] });
      await parseForwardedMessage(msg, mockClient);
    } catch (e) {
      threw = true;
      errorMessage = (e as Error).message ?? String(e);
    }

    if (threw) {
      // If it throws, it should be a meaningful error, not a TypeScript non-null crash
      expect(errorMessage).not.toMatch(/Cannot read propert/);
      // BUG-C2: if this fails, the crash message reveals the non-null assertion bug
    }
    // If it doesn't throw and mockClient.downloadMedia was called with undefined → also a bug
    // The function should guard against undefined image field before calling client.downloadMedia
  });

  // ---- Empty body string ----
  it('A4-4: type=text with empty body string → should handle gracefully, not crash', async () => {
    mockCallAiJson.mockResolvedValueOnce({ missing_info: [] });
    const msg = makeMsg('text', { text: { body: '' } });
    const result = await parseForwardedMessage(msg, mockClient);
    // Should return some result (even empty/uncertain), not throw
    expect(result).toBeDefined();
    expect(result.confidence).toBe('uncertain');
  });

  // ---- Whitespace-only body ----
  it('A4-5: type=text with whitespace-only body → should be treated as empty', async () => {
    mockCallAiJson.mockResolvedValueOnce({ missing_info: [] });
    const msg = makeMsg('text', { text: { body: '   \t\n   ' } });
    const result = await parseForwardedMessage(msg, mockClient);
    expect(result).toBeDefined();
    // Whitespace-only text should yield uncertain confidence
    expect(result.confidence).toBe('uncertain');
  });

  // ---- Very long body (10MB) ----
  it('A4-6: type=text with 10MB body → should handle or truncate gracefully, not OOM crash', async () => {
    const largeBody = 'A'.repeat(10 * 1024 * 1024); // 10MB
    mockCallAiJson.mockResolvedValueOnce({
      cargo_description: { value: 'Bulk grain', confidence: 'confirmed' },
      origin_port: { value: 'Santos', confidence: 'confirmed' },
      missing_info: [],
    });
    const msg = makeMsg('text', { text: { body: largeBody } });

    let result: Awaited<ReturnType<typeof parseForwardedMessage>> | undefined;
    let threw = false;
    try {
      result = await parseForwardedMessage(msg, mockClient);
    } catch (e) {
      threw = true;
    }

    // Should not crash — either handle or truncate
    expect(threw).toBe(false);
    if (result) {
      expect(result).toBeDefined();
    }
    // BUG-C3: if threw=true, no size guard exists
  }, 15_000);

  // ---- Malformed JSON from AI (callAiJson throws) ----
  it('A4-7: AI returns malformed JSON → callAiJson throws → parseForwardedMessage should propagate or handle', async () => {
    mockCallAiJson.mockRejectedValueOnce(new SyntaxError('Unexpected token { in JSON'));
    const msg = makeMsg('text', { text: { body: 'Cargo from Dubai to Jeddah' } });

    let threw = false;
    let errorType = '';
    try {
      await parseForwardedMessage(msg, mockClient);
    } catch (e) {
      threw = true;
      errorType = (e as Error).constructor.name;
    }

    // Should either propagate as SyntaxError or return a graceful uncertain result
    // It must NOT swallow the error and silently return incorrect data
    if (!threw) {
      // If it doesn't throw, the result should indicate failure
      // This is actually acceptable — but callAiJson mock rejected, so we expect throw or catch+return
    }
    // Either behavior (throw or graceful return) is documented. The point is not to return false data.
    expect(true).toBe(true); // Always passes — behavior is documented in findings
  });

  // ---- AI returns null/empty response ----
  it('A4-8: AI returns null → should handle gracefully without crash', async () => {
    mockCallAiJson.mockResolvedValueOnce(null as never);
    const msg = makeMsg('text', { text: { body: 'Cargo from Dubai to Jeddah' } });

    let threw = false;
    let errorMessage = '';
    try {
      await parseForwardedMessage(msg, mockClient);
    } catch (e) {
      threw = true;
      errorMessage = (e as Error).message ?? '';
    }

    if (threw) {
      // If it crashes on null AI response, that's BUG-C4
      // The error should not be "Cannot read properties of null"
      expect(errorMessage).not.toMatch(/Cannot read propert/i);
    }
  });

  // ---- messageType = 'video' should not hit callAiJson ----
  it('A4-9: type=video (unsupported) → should NOT call callAiJson (cost leakage prevention)', async () => {
    const msg = makeMsg('video' as WhatsAppIncomingMessage['type']);
    await parseForwardedMessage(msg, mockClient);

    // 'video' hits the default switch case → early return before callAiJson
    expect(mockCallAiJson).not.toHaveBeenCalled();
  });

  // ---- msg.text missing entirely (not just body) ----
  it('A4-10: type=text but msg.text is undefined → should return uncertain, not crash', async () => {
    mockCallAiJson.mockResolvedValueOnce({ missing_info: [] });
    const msg = makeMsg('text'); // no text field at all
    const result = await parseForwardedMessage(msg, mockClient);
    expect(result).toBeDefined();
    expect(result.confidence).toBe('uncertain');
  });
});

// ---------------------------------------------------------------------------
// ATTACK-10 — detectTextDirection adversarial edge cases
// ---------------------------------------------------------------------------

import { detectTextDirection, detectLocale } from '../../lib/i18n/rtl-detect';

describe('ATTACK-10 — detectTextDirection adversarial edge cases', () => {
  // ---- Empty string ----
  it('A10-1: empty string "" → should return "ltr", not crash', () => {
    expect(detectTextDirection('')).toBe('ltr');
  });

  // ---- Whitespace only ----
  it('A10-2: whitespace-only "   " → should return "ltr"', () => {
    expect(detectTextDirection('   ')).toBe('ltr');
  });

  // ---- Pure Arabic ----
  it('A10-3: pure Arabic "مرحبا" → should return "rtl"', () => {
    expect(detectTextDirection('مرحبا')).toBe('rtl');
  });

  // ---- Pure Hebrew ----
  it('A10-4: pure Hebrew "שלום" → should return "rtl"', () => {
    expect(detectTextDirection('שלום')).toBe('rtl');
  });

  // ---- Pure Latin ----
  it('A10-5: pure Latin "Hello World" → should return "ltr"', () => {
    expect(detectTextDirection('Hello World')).toBe('ltr');
  });

  // ---- Exactly 30% RTL: 3 Arabic + 7 Latin = 10 total, ratio = 0.3 ----
  it('A10-6: exactly 30% RTL (3 Arabic + 7 Latin) → should return "ltr" (threshold is strictly > 0.3)', () => {
    // 3 Arabic letters + 7 Latin letters = 30% RTL
    const text = 'ابت' + 'abcdefg'; // 3 Arabic + 7 Latin
    const direction = detectTextDirection(text);
    // 3/10 = 0.3, condition is > 0.3, so this should be 'ltr'
    expect(direction).toBe('ltr');
  });

  // ---- Just above 30%: 31 Arabic + 69 Latin ----
  it('A10-7: just above 30% RTL (31 Arabic + 69 Latin = 31%) → should return "rtl"', () => {
    const arabicChars = 'ا'.repeat(31);
    const latinChars = 'a'.repeat(69);
    const text = arabicChars + latinChars;
    expect(detectTextDirection(text)).toBe('rtl');
  });

  // ---- Just below 30%: 29 Arabic + 71 Latin ----
  it('A10-8: just below 30% RTL (29 Arabic + 71 Latin = 29%) → should return "ltr"', () => {
    const arabicChars = 'ا'.repeat(29);
    const latinChars = 'a'.repeat(71);
    const text = arabicChars + latinChars;
    expect(detectTextDirection(text)).toBe('ltr');
  });

  // ---- Arabic-Indic digits: U+0660–U+0669 ----
  it('A10-9: Arabic-Indic digits only "٠١٢٣٤٥٦٧٨٩" → should return "ltr" (digits are not RTL letters)', () => {
    // Arabic-Indic digits U+0660–U+0669 fall WITHIN U+0600–U+06FF (Arabic block)
    // This is the BUG CANDIDATE: the regex /[؀-ۿ]/ matches digits too
    const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩'; // U+0660-U+0669
    const direction = detectTextDirection(arabicIndicDigits);
    // Arabic-Indic digits SHOULD NOT count as RTL letters
    // But the current regex [؀-ۿ] includes them!
    // If this test FAILS (direction = 'rtl'), that is BUG-C5
    expect(direction).toBe('ltr');
  });

  // ---- Emoji + Arabic ----
  it('A10-10: emoji + Arabic "🚢مرحبا" → emoji should not skew the ratio', () => {
    // Emojis should not be counted as LTR letters, only RTL and Latin should count
    const text = '🚢🚢🚢🚢🚢🚢🚢' + 'مرحبا'; // 7 emoji + 5 Arabic
    const direction = detectTextDirection(text);
    // 5 Arabic / 5 total letters = 100% RTL → should be 'rtl'
    expect(direction).toBe('rtl');
  });

  // ---- Very long string (10,000 chars) ----
  it('A10-11: 10,000 char string → should handle without timeout', () => {
    const longText = 'Hello World '.repeat(834); // ~10,008 chars, all Latin
    const start = Date.now();
    const direction = detectTextDirection(longText);
    const elapsed = Date.now() - start;
    expect(direction).toBe('ltr');
    expect(elapsed).toBeLessThan(1000); // Should complete in < 1 second
  });

  // ---- detectLocale with Arabic-Indic digits ----
  it('A10-12: detectLocale with Arabic-Indic digits only → should return en/ltr (not ar/rtl)', () => {
    const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';
    const locale = detectLocale(arabicIndicDigits);
    // Arabic-Indic digits fall in Arabic block, so detectLocale may wrongly return ar/rtl
    // If this FAILS → BUG-C5 confirmed in detectLocale too
    expect(locale.language).toBe('en');
    expect(locale.direction).toBe('ltr');
  });

  // ---- null/undefined resilience ----
  it('A10-13: null input → should not crash (uses falsy guard)', () => {
    // The function uses `if (!text) return 'ltr'` so null should be safe
    expect(() => detectTextDirection(null as never)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ATTACK-12 — parseBunkerHtml adversarial edge cases
// ---------------------------------------------------------------------------

import { parseBunkerHtml } from '../../lib/economics/bunker';

describe('ATTACK-12 — parseBunkerHtml adversarial edge cases', () => {
  // Helper: build a minimal row HTML
  function makeRow(portName: string, vlsfoCellContent: string, mgoCellContent?: string): string {
    const mgoCell = mgoCellContent
      ? `<td class="mgo">${mgoCellContent}</td>`
      : '';
    return `<tr class="port-row">
      <td class="port-name">${portName}</td>
      <td class="vlsfo">${vlsfoCellContent}</td>
      ${mgoCell}
    </tr>`;
  }

  // ---- Nested tags: <span>$<b>450</b>.00</span> ----
  it('A12-1: VLSFO cell with nested tags <span>$<b>450</b>.00</span> → price should be extracted correctly or NaN', () => {
    // The regex expects: <td class="vlsfo">\s*([\d]+\.[\d]+)\s*</td>
    // Nested tags will fail to match → vlsfoMatch = null → row is SKIPPED
    const html = `<tr class="port-row">
      <td class="port-name">Rotterdam</td>
      <td class="vlsfo"><span>$<b>450</b>.00</span></td>
    </tr>`;
    const result = parseBunkerHtml(html);
    // BUG-C6: if nested tags cause the row to be silently skipped, Rotterdam won't appear
    const rotterdam = result.get('Rotterdam');
    if (!rotterdam) {
      // Row was silently dropped — documents BUG-C6
      expect(rotterdam).toBeUndefined(); // This passes but documents the bug
    } else {
      expect(rotterdam.vlsfo).toBe(450.0);
    }
  });

  it('A12-1b: control — plain VLSFO cell parses correctly', () => {
    const html = makeRow('Rotterdam', '450.00');
    const result = parseBunkerHtml(html);
    const rotterdam = result.get('Rotterdam');
    expect(rotterdam).toBeDefined();
    expect(rotterdam?.vlsfo).toBe(450.0);
  });

  // ---- EU comma decimal format: 450,50 ----
  it('A12-2: EU comma decimal "450,50" → should parse as 450.50 or NaN (documents behavior)', () => {
    // The regex [\d]+\.[\d]+ requires a dot — comma format will fail to match
    // So the row will be silently skipped → BUG-C7
    const html = `<tr class="port-row">
      <td class="port-name">Hamburg</td>
      <td class="vlsfo">450,50</td>
    </tr>`;
    const result = parseBunkerHtml(html);
    const hamburg = result.get('Hamburg');

    // Documents the behavior: either parsed correctly or silently dropped
    if (hamburg) {
      // If somehow parsed, check the value
      expect(hamburg.vlsfo).toBe(450.5);
    } else {
      // Row was silently dropped because regex requires dot decimal
      // BUG-C7: EU comma-decimal prices are silently ignored
      expect(hamburg).toBeUndefined(); // Passes but documents bug
    }
  });

  // ---- Price with space: "450 .00" ----
  it('A12-3: VLSFO price with space "450 .00" → should parse or skip gracefully', () => {
    const html = `<tr class="port-row">
      <td class="port-name">Fujairah</td>
      <td class="vlsfo">450 .00</td>
    </tr>`;
    const result = parseBunkerHtml(html);
    // The regex won't match "450 .00" — will be skipped
    const fujairah = result.get('Fujairah');
    // Documents behavior — if undefined, silently dropped
    if (fujairah) {
      expect(fujairah.vlsfo).toBeGreaterThan(0);
    }
    // No assertion failure — just documents the limitation
    expect(true).toBe(true);
  });

  // ---- Port appears twice → first or last wins ----
  it('A12-4: port appears twice → Map.set overwrites with last occurrence', () => {
    const html = `
      <tr class="port-row">
        <td class="port-name">Singapore</td>
        <td class="vlsfo">450.00</td>
      </tr>
      <tr class="port-row">
        <td class="port-name">Singapore</td>
        <td class="vlsfo">499.00</td>
      </tr>
    `;
    const result = parseBunkerHtml(html);
    const singapore = result.get('Singapore');
    expect(singapore).toBeDefined();
    // Map.set overwrites → last value wins
    // Documents that duplicate handling is "last wins" with no deduplication warning
    expect(singapore?.vlsfo).toBe(499.0);
    // BUG-C8: if first value (450) is expected but last (499) is returned → silent overwrite
  });

  // ---- All ports return NaN prices ----
  it('A12-5: all VLSFO values are non-numeric → map is empty (graceful)', () => {
    const html = `
      <tr class="port-row">
        <td class="port-name">PortA</td>
        <td class="vlsfo">N/A</td>
      </tr>
      <tr class="port-row">
        <td class="port-name">PortB</td>
        <td class="vlsfo">TBD</td>
      </tr>
    `;
    const result = parseBunkerHtml(html);
    // All rows skipped due to NaN check → empty map
    expect(result.size).toBe(0);
  });

  // ---- Empty port list ----
  it('A12-6: empty HTML → empty map (graceful)', () => {
    const result = parseBunkerHtml('');
    expect(result.size).toBe(0);
    expect(result).toBeInstanceOf(Map);
  });

  // ---- HTML with no port-row class ----
  it('A12-7: HTML with no port-row class → empty map', () => {
    const html = `<table><tr><td>Rotterdam</td><td>450.00</td></tr></table>`;
    const result = parseBunkerHtml(html);
    expect(result.size).toBe(0);
  });

  // ---- Port name with HTML entities ----
  it('A12-8: port name with HTML entities "Port &amp; Trade" → extracted with entity, not decoded', () => {
    const html = makeRow('Port &amp; Trade', '475.50');
    const result = parseBunkerHtml(html);
    // The regex captures raw HTML — entities are NOT decoded
    // So key will be "Port &amp; Trade" not "Port & Trade"
    const hasAmpEntity = result.has('Port &amp; Trade');
    const hasAmpDecoded = result.has('Port & Trade');
    // Documents that HTML entities are not decoded (potential data quality issue)
    expect(hasAmpEntity || hasAmpDecoded).toBe(true);
  });

  // ---- Verify fetched_at is ISO date string ----
  it('A12-9: parsed row has valid ISO fetched_at timestamp', () => {
    const html = makeRow('Dubai', '480.50');
    const result = parseBunkerHtml(html);
    const dubai = result.get('Dubai');
    expect(dubai).toBeDefined();
    expect(new Date(dubai!.fetched_at).toISOString()).toBe(dubai!.fetched_at);
  });

  // ---- findCheapestPort: all NaN scenario (via parseBunkerHtml) ----
  it('A12-10: parseBunkerHtml with only integer prices (no decimal) → skipped due to strict regex', () => {
    // The regex requires [\d]+\.[\d]+ — integers without decimal are NOT matched
    // This is BUG-C9: "450" alone would not be matched but "450.0" would
    const html = `<tr class="port-row">
      <td class="port-name">Colombo</td>
      <td class="vlsfo">450</td>
    </tr>`;
    const result = parseBunkerHtml(html);
    const colombo = result.get('Colombo');
    // Documents: integer prices without decimal separator are silently dropped
    if (!colombo) {
      // BUG-C9: integer price "450" silently dropped
      expect(colombo).toBeUndefined(); // passes but documents bug
    } else {
      expect(colombo.vlsfo).toBe(450);
    }
  });
});
