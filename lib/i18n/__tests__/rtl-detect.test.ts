import { detectTextDirection, detectLocale } from '../rtl-detect';

describe('detectTextDirection', () => {
  test('Latin text → ltr', () => {
    expect(detectTextDirection('Hello world')).toBe('ltr');
  });

  test('Arabic text → rtl', () => {
    expect(detectTextDirection('مرحبا بكم')).toBe('rtl');
  });

  test('Hebrew text → rtl', () => {
    expect(detectTextDirection('שלום עולם')).toBe('rtl');
  });

  test('mixed text majority Arabic → rtl', () => {
    // Arabic chars dominate → rtl
    expect(detectTextDirection('Hello مرحبا بكم في العالم العربي')).toBe('rtl');
  });

  test('empty string → ltr (default)', () => {
    expect(detectTextDirection('')).toBe('ltr');
  });

  test('mixed text majority Latin → ltr', () => {
    expect(detectTextDirection('Hello world this is mostly English مرحبا')).toBe('ltr');
  });
});

describe('detectLocale', () => {
  test('English text → { language: "en", direction: "ltr" }', () => {
    const result = detectLocale('Hello world');
    expect(result.direction).toBe('ltr');
    expect(result.language).toBe('en');
  });

  test('Arabic text → { language: "ar", direction: "rtl" }', () => {
    const result = detectLocale('مرحبا بكم في الكويت');
    expect(result.direction).toBe('rtl');
    expect(result.language).toBe('ar');
  });

  test('Hebrew text → { language: "he", direction: "rtl" }', () => {
    const result = detectLocale('שלום עולם');
    expect(result.direction).toBe('rtl');
    expect(result.language).toBe('he');
  });

  test('empty string → { language: "en", direction: "ltr" }', () => {
    const result = detectLocale('');
    expect(result.direction).toBe('ltr');
    expect(result.language).toBe('en');
  });
});
