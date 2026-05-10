/**
 * Tests for lib/corpus/forward-unwrap.ts
 * Deterministic regex/string tests — no LLM, no network.
 */

import { unwrapForwardLayers } from '../forward-unwrap';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function gmail3Layer(): string {
  return [
    'Outer message body — layer 3.',
    '',
    '---------- Forwarded message ----------',
    'From: middle@example.com',
    'Date: Wed, 08 May 2026 12:00:00 +0000',
    'Subject: Middle forward',
    'To: outer@example.com',
    '',
    'Middle message body — layer 2.',
    '',
    '---------- Forwarded message ----------',
    'From: original@shipper.com',
    'Date: Mon, 06 May 2026 09:00:00 +0000',
    'Subject: Original inquiry',
    'To: middle@example.com',
    '',
    'This is the innermost original message.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Gmail forward — single layer
// ---------------------------------------------------------------------------

describe('unwrapForwardLayers — Gmail single layer', () => {
  it('extracts innermost body from single Gmail forward', () => {
    const body = [
      'Please see forwarded inquiry below.',
      '',
      '---------- Forwarded message ----------',
      'From: cargo@shipper.com',
      'Date: Fri, 02 May 2026 08:00:00 +0000',
      'Subject: Bulk cargo query',
      'To: forwarder@example.com',
      '',
      'Dear Forwarder,',
      '',
      'We need to ship 10000mt of grain from Odessa to Rotterdam.',
      '',
      'Best regards,',
      'Cargo Team',
    ].join('\n');

    const result = unwrapForwardLayers(body);

    expect(result.layerCount).toBe(1);
    expect(result.innermostBody).toContain('We need to ship 10000mt');
    expect(result.innermostBody).not.toContain('Please see forwarded');
    expect(result.originalFrom).toBe('cargo@shipper.com');
    expect(result.originalSubject).toBe('Bulk cargo query');
    expect(result.originalDate).toBe('Fri, 02 May 2026 08:00:00 +0000');
  });
});

// ---------------------------------------------------------------------------
// Gmail forward — 3 layers
// ---------------------------------------------------------------------------

describe('unwrapForwardLayers — 3-layer Gmail forward', () => {
  it('unwraps all 3 layers and returns innermost body', () => {
    const result = unwrapForwardLayers(gmail3Layer());

    expect(result.layerCount).toBe(2); // 2 "Forwarded message" separators
    expect(result.innermostBody).toContain('This is the innermost original message.');
    expect(result.innermostBody).not.toContain('Outer message body');
    expect(result.innermostBody).not.toContain('Middle message body');
  });

  it('captures original sender from FIRST (outermost) forward layer', () => {
    const result = unwrapForwardLayers(gmail3Layer());
    // originalFrom should be from the first forward encountered
    expect(result.originalFrom).toBe('middle@example.com');
    expect(result.originalSubject).toBe('Middle forward');
  });
});

// ---------------------------------------------------------------------------
// Apple Mail format
// ---------------------------------------------------------------------------

describe('unwrapForwardLayers — Apple Mail', () => {
  it('detects "Begin forwarded message:" marker', () => {
    const body = [
      'FYI please handle this.',
      '',
      'Begin forwarded message:',
      'From: client@arabtraders.ae',
      'Date: Thursday, 1 May 2026 at 09:30:00 GMT',
      'Subject: Vessel charter request',
      'To: broker@quantika.com',
      '',
      'Hi,',
      '',
      'We are looking to charter a Panamax vessel for a coal cargo.',
      '',
      'Regards',
    ].join('\n');

    const result = unwrapForwardLayers(body);

    expect(result.layerCount).toBe(1);
    expect(result.innermostBody).toContain('Panamax vessel');
    expect(result.innermostBody).not.toContain('FYI please handle');
    expect(result.originalFrom).toBe('client@arabtraders.ae');
    expect(result.originalSubject).toBe('Vessel charter request');
  });

  it('uses Apple Mail fixture decoded from base64', () => {
    // Actual decoded content from thread-forwarded-apple.json
    const body = `FYI please handle this.\n\nBegin forwarded message:\nFrom: client@arabtraders.ae\nDate: Thursday, 1 May 2026 at 09:30:00 GMT\nSubject: Vessel charter request\nTo: broker@quantika.com\n\nHi,\n\nWe are looking to charter a Panamax vessel for a coal cargo.\n\nRegards`;

    const result = unwrapForwardLayers(body);
    expect(result.layerCount).toBe(1);
    expect(result.originalFrom).toBe('client@arabtraders.ae');
  });
});

// ---------------------------------------------------------------------------
// Outlook style (no explicit "forwarded" label)
// ---------------------------------------------------------------------------

describe('unwrapForwardLayers — Outlook style', () => {
  it('detects Outlook From/Sent/To/Subject block', () => {
    const body = [
      'See below for the original request.',
      '',
      'From: shipper@cargo.com',
      'Sent: Tuesday, 5 May 2026 14:30',
      'To: agent@forwarder.com',
      'Subject: Shipment inquiry',
      '',
      'Please provide a rate for 500 CBM of electronics from Shanghai to Hamburg.',
      '',
      'Thanks',
    ].join('\n');

    const result = unwrapForwardLayers(body);

    expect(result.layerCount).toBe(1);
    expect(result.originalFrom).toBe('shipper@cargo.com');
    expect(result.originalSubject).toBe('Shipment inquiry');
  });
});

// ---------------------------------------------------------------------------
// No forward marker
// ---------------------------------------------------------------------------

describe('unwrapForwardLayers — no forward', () => {
  it('returns original body as-is with layerCount=0 when no forward markers', () => {
    const body = 'Hello, I need a quote for 5000mt of steel coils.';
    const result = unwrapForwardLayers(body);

    expect(result.layerCount).toBe(0);
    expect(result.innermostBody).toBe(body);
    expect(result.originalFrom).toBeNull();
    expect(result.originalSubject).toBeNull();
    expect(result.originalDate).toBeNull();
  });

  it('handles empty body gracefully', () => {
    const result = unwrapForwardLayers('');
    expect(result.layerCount).toBe(0);
    expect(result.originalFrom).toBeNull();
  });

  it('handles whitespace-only body gracefully', () => {
    const result = unwrapForwardLayers('   \n  \n ');
    expect(result.layerCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Broken / partial markers — degrade gracefully, never throw
// ---------------------------------------------------------------------------

describe('unwrapForwardLayers — broken/partial markers', () => {
  it('does not throw on partial Gmail marker (dashes without "Forwarded message")', () => {
    const body = [
      'Some message.',
      '',
      '----------',
      'incomplete marker with no forwarded text',
    ].join('\n');

    expect(() => unwrapForwardLayers(body)).not.toThrow();
    const result = unwrapForwardLayers(body);
    // Should not detect this as a forward (no "Forwarded message" text)
    expect(result.layerCount).toBe(0);
  });

  it('does not throw on body with only "From:" line (no Sent/To/Subject)', () => {
    const body = 'From: someone@example.com\nSome text without proper Outlook block.';

    expect(() => unwrapForwardLayers(body)).not.toThrow();
    // Incomplete Outlook block — may or may not detect, but must not throw
    const result = unwrapForwardLayers(body);
    expect(typeof result.layerCount).toBe('number');
  });

  it('does not throw on very long body', () => {
    const body = 'Line of text.\n'.repeat(1000);
    expect(() => unwrapForwardLayers(body)).not.toThrow();
    const result = unwrapForwardLayers(body);
    expect(result.layerCount).toBe(0);
  });

  it('truncates at safety limit of 10 layers without hanging', () => {
    // Build a deeply nested Gmail forward (>10 layers)
    let body = 'Innermost original.';
    for (let i = 0; i < 12; i++) {
      body = [
        `Layer ${i} intro.`,
        '',
        '---------- Forwarded message ----------',
        `From: layer${i}@example.com`,
        `Date: Mon, 06 May 2026 0${(i % 10)}:00:00 +0000`,
        `Subject: Layer ${i}`,
        `To: next@example.com`,
        '',
        body,
      ].join('\n');
    }

    const result = unwrapForwardLayers(body);
    expect(result.layerCount).toBeLessThanOrEqual(10);
    expect(result.innermostBody).toBeTruthy();
  });

  it('handles "Begin forwarded message:" with no following headers', () => {
    const body = [
      'Outer text.',
      '',
      'Begin forwarded message:',
      // No headers after — just body
      '',
      'Original body content here.',
    ].join('\n');

    expect(() => unwrapForwardLayers(body)).not.toThrow();
    const result = unwrapForwardLayers(body);
    expect(result.layerCount).toBe(1);
  });
});
