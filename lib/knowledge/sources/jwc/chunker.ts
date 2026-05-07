/**
 * JWC bulletin chunker
 * Converts JWC bulletins into chunks suitable for vector embedding
 *
 * Input Contract:
 * - Empty bulletins array → return []
 * - Empty rawText → skip bulletin
 * - Whitespace-only rawText → skip bulletin
 * - Very long text → split on paragraph/sentence boundaries
 * - No regions in text → regions: []
 */

import type { Chunk } from '@/lib/knowledge/embeddings/chunks';

// JwcScrapedBulletin type (from spec-17)
export interface JwcScrapedBulletin {
  id: string;
  publishDate: string;
  title: string;
  rawText: string;
  sourceUrl: string;
}

// Known geographic regions for war risk analysis
const KNOWN_REGIONS: Record<string, string[]> = {
  'Black Sea': ['Black Sea', 'Черное море'],
  'Red Sea': ['Red Sea', 'Красное море', 'Bab el-Mandeb', 'Bab al-Mandab'],
  'Persian Gulf': [
    'Persian Gulf',
    'Arabian Gulf',
    'Персидский залив',
    'Strait of Hormuz',
  ],
  'Gulf of Aden': ['Gulf of Aden', 'Аденский залив'],
  'Gulf of Oman': ['Gulf of Oman', 'Оманский залив'],
  'Gulf of Guinea': ['Gulf of Guinea', 'Гвинейский залив'],
  'Indian Ocean': ['Indian Ocean', 'Индийский океан'],
  'South China Sea': ['South China Sea', 'Южно-Китайское море'],
  'Malacca Strait': [
    'Malacca Strait',
    'Strait of Malacca',
    'Малаккский пролив',
  ],
  Mediterranean: ['Mediterranean', 'Средиземное море'],
  'Sea of Azov': ['Sea of Azov', 'Азовское море'],
  'Arabian Sea': ['Arabian Sea', 'Аравийское море'],
  'Suez Canal': ['Suez Canal', 'Суэцкий канал'],
  Ukraine: ['Ukraine', 'Ukrainian', 'Украина'],
  Libya: ['Libya', 'Libyan', 'Ливия'],
  Yemen: ['Yemen', 'Yemeni', 'Йемен'],
  Somalia: ['Somalia', 'Somali', 'Сомали'],
  Nigeria: ['Nigeria', 'Nigerian', 'Нигерия'],
  Israel: ['Israel', 'Israeli', 'Израиль'],
  Lebanon: ['Lebanon', 'Lebanese', 'Ливан'],
};

/**
 * Extract geographic regions from bulletin text
 * Case-insensitive matching with deduplication
 */
function extractRegions(text: string): string[] {
  const foundRegions = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const [canonicalName, aliases] of Object.entries(KNOWN_REGIONS)) {
    for (const alias of aliases) {
      if (lowerText.includes(alias.toLowerCase())) {
        foundRegions.add(canonicalName);
        break; // Found this region, move to next
      }
    }
  }

  return Array.from(foundRegions);
}

/**
 * Normalize whitespace: collapse multiple spaces/newlines, trim
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Estimate token count (text.length / 4)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks at paragraph boundaries
 */
function splitOnParagraphs(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    const normalizedPara = normalizeWhitespace(para);
    if (!normalizedPara) continue;

    if (
      currentChunk.length + normalizedPara.length + 1 <= maxChars &&
      currentChunk.length > 0
    ) {
      currentChunk += ' ' + normalizedPara;
    } else if (currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = normalizedPara;
    } else {
      currentChunk = normalizedPara;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // Handle case where single paragraph exceeds maxChars
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > maxChars) {
      finalChunks.push(...splitOnSentences(chunk, maxChars));
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

/**
 * Split text into chunks at sentence boundaries
 */
function splitOnSentences(text: string, maxChars: number): string[] {
  const sentences = text.split(/\.\s+|\.\n/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;

    // Add period back if not last sentence
    const sentenceWithPeriod =
      i < sentences.length - 1 || text.endsWith('.')
        ? sentence + '.'
        : sentence;

    if (
      currentChunk.length + sentenceWithPeriod.length + 1 <= maxChars &&
      currentChunk.length > 0
    ) {
      currentChunk += ' ' + sentenceWithPeriod;
    } else if (currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = sentenceWithPeriod;
    } else {
      currentChunk = sentenceWithPeriod;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // Handle case where single sentence exceeds maxChars - split on word boundary
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > maxChars) {
      finalChunks.push(...splitOnWords(chunk, maxChars));
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

/**
 * Split text at word boundaries when sentence is too long
 */
function splitOnWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const word of words) {
    if (currentChunk.length + word.length + 1 <= maxChars) {
      currentChunk += (currentChunk ? ' ' : '') + word;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = word;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Chunk JWC bulletins into Chunk[] for vector embedding
 * Most bulletins (200-800 words) produce 1 chunk
 * Long bulletins split on paragraph/sentence boundaries (max 8000 chars = 2000 tokens)
 */
export function chunkJwc(bulletins: JwcScrapedBulletin[]): Chunk[] {
  const chunks: Chunk[] = [];
  const MAX_CHARS = 8000; // ~2000 tokens

  for (const bulletin of bulletins) {
    const normalized = normalizeWhitespace(bulletin.rawText);

    // Skip empty or whitespace-only bulletins
    if (!normalized) {
      continue;
    }

    const regions = extractRegions(bulletin.rawText);

    // Check if bulletin needs splitting
    if (normalized.length <= MAX_CHARS) {
      // Single chunk
      chunks.push({
        content: normalized,
        metadata: {
          source: 'jwc',
          sourceUrl: bulletin.sourceUrl,
          title: bulletin.title,
          bulletinId: bulletin.id,
          publishDate: bulletin.publishDate,
          regions,
          chunkIndex: 0,
        },
      });
    } else {
      // Split into multiple chunks
      const textChunks = splitOnParagraphs(normalized, MAX_CHARS);

      textChunks.forEach((textChunk, index) => {
        chunks.push({
          content: textChunk,
          metadata: {
            source: 'jwc',
            sourceUrl: bulletin.sourceUrl,
            title: bulletin.title,
            bulletinId: bulletin.id,
            publishDate: bulletin.publishDate,
            regions,
            chunkIndex: index,
          },
        });
      });
    }
  }

  return chunks;
}
