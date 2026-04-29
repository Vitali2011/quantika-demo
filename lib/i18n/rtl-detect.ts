// Arabic Unicode block: U+0600–U+06FF, excluding numerals:
// U+0660–U+0669 = Arabic-Indic digits (٠-٩)
// U+06F0–U+06F9 = Extended Arabic-Indic digits (۰-۹)
const ARABIC_RE = /[\u0600-\u065F\u066A-\u06EF\u06FA-\u06FF]/g;
// Hebrew Unicode block: U+0590–U+05FF
const HEBREW_RE = /[\u0590-\u05FF]/g;

/**
 * Detects the primary text direction of a string.
 * Returns 'rtl' if RTL characters (Arabic/Hebrew) exceed 30% of total letters.
 * Returns 'ltr' otherwise (including empty strings).
 */
export function detectTextDirection(text: string): 'ltr' | 'rtl' {
  if (!text) return 'ltr';

  const arabicCount = (text.match(ARABIC_RE) ?? []).length;
  const hebrewCount = (text.match(HEBREW_RE) ?? []).length;
  const rtlCount = arabicCount + hebrewCount;

  const totalLetters = (text.match(/[a-zA-Z\u0590-\u05FF\u0600-\u065F\u066A-\u06EF\u06FA-\u06FF]/g) ?? []).length;
  if (totalLetters === 0) return 'ltr';

  return rtlCount / totalLetters > 0.3 ? 'rtl' : 'ltr';
}

/**
 * Detects the locale and direction of a text string.
 * Identifies Arabic (ar), Hebrew (he), or falls back to English (en).
 */
export function detectLocale(text: string): { language: string; direction: 'ltr' | 'rtl' } {
  if (!text) return { language: 'en', direction: 'ltr' };

  const arabicCount = (text.match(ARABIC_RE) ?? []).length;
  const hebrewCount = (text.match(HEBREW_RE) ?? []).length;
  const totalLetters = (text.match(/[a-zA-Z\u0590-\u05FF\u0600-\u065F\u066A-\u06EF\u06FA-\u06FF]/g) ?? []).length;

  if (totalLetters === 0) return { language: 'en', direction: 'ltr' };

  if (arabicCount / totalLetters > 0.3) return { language: 'ar', direction: 'rtl' };
  if (hebrewCount / totalLetters > 0.3) return { language: 'he', direction: 'rtl' };
  return { language: 'en', direction: 'ltr' };
}
