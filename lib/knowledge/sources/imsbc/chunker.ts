/**
 * IMSBC Code chunker — converts scraped HTML sections into plain-text chunks
 * Spec: spec-13-chunkimsbc-sections
 */

import type { Chunk } from '@/lib/knowledge/embeddings/chunks';
import type { ScrapedSection } from './scraper';

/**
 * Strips dangerous HTML elements (script, style, iframe, object, embed) and their content
 * Defense-in-depth: scraper should already strip these, but chunker doesn't trust input
 */
function stripDangerousElements(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>[\s\S]*?<\/embed>/gi, '');
}

/**
 * Strips all HTML tags and decodes entities to produce plain text
 * Preserves paragraph structure (double newlines) for splitting logic
 */
function htmlToPlainText(html: string): string {
  // First, strip dangerous elements
  let text = stripDangerousElements(html);

  // Replace heading tags with content + paragraph markers (preserve SECTION headings)
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '$1\n\n');

  // Replace block-level tags with paragraph markers before stripping
  text = text.replace(/<\/p>/gi, '</p>\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/div>/gi, '</div>\n\n');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Normalize whitespace but preserve double newlines for paragraph boundaries
  text = text.replace(/[ \t]+/g, ' '); // Collapse spaces/tabs
  text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 newlines (paragraph boundary)
  text = text.trim();

  return text;
}

/**
 * Splits text on SECTION/APPENDIX headings
 * Returns array of {heading, content} objects
 * Only matches headings at line boundaries (start of string or after newline)
 */
function splitOnHeadings(text: string): Array<{ heading: string; content: string }> {
  // Match "SECTION \d+" or "APPENDIX [A-Z]" only at line start (case-insensitive)
  // Allow optional whitespace before heading after newline
  const headingRegex = /(?:^|\n)\s*(SECTION\s+\d+|APPENDIX\s+[A-Z])(?:\s|$)/gim;
  const matches = Array.from(text.matchAll(headingRegex));

  if (matches.length === 0) {
    return [{ heading: '', content: text }];
  }

  const sections: Array<{ heading: string; content: string }> = [];

  // If there's content before the first heading, include it
  const firstMatch = matches[0];
  if (firstMatch.index! > 0) {
    const preContent = text.slice(0, firstMatch.index!).trim();
    if (preContent) {
      sections.push({ heading: '', content: preContent });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const heading = match[1]; // Capture group 1 is the heading text
    const startIdx = match.index! + match[0].length;
    const endIdx = i < matches.length - 1 ? matches[i + 1].index! : text.length;
    const content = text.slice(startIdx, endIdx).trim();

    if (content) {
      sections.push({ heading, content });
    }
  }

  return sections.length > 0 ? sections : [{ heading: '', content: text }];
}

/**
 * Splits text into chunks respecting size limits
 * Target: 200-600 tokens (~800-2400 chars)
 * Hard cap: 2000 tokens (~8000 chars)
 */
function splitIntoChunks(text: string): string[] {
  const HARD_CAP_CHARS = 8000; // 2000 tokens × 4 chars/token
  const TARGET_MAX_CHARS = 2400; // 600 tokens × 4 chars/token

  if (text.length <= TARGET_MAX_CHARS) {
    return [text];
  }

  const chunks: string[] = [];

  // Split on paragraph boundaries (double newline)
  const paragraphs = text.split('\n\n').filter((p) => p.trim().length > 0);

  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // If single paragraph exceeds hard cap, must split it
    if (paragraph.length > HARD_CAP_CHARS) {
      // Flush current chunk if exists
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // Split mega-paragraph on sentence boundaries or word boundaries
      const megaChunks = splitMegaParagraph(paragraph, HARD_CAP_CHARS);
      chunks.push(...megaChunks);
      continue;
    }

    // Try adding paragraph to current chunk
    const testChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;

    if (testChunk.length <= HARD_CAP_CHARS) {
      currentChunk = testChunk;
    } else {
      // Current chunk is full, start new chunk
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
    }
  }

  // Flush remaining chunk
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Splits a mega-paragraph that exceeds hard cap
 * Tries sentence boundaries first, falls back to word boundaries
 */
function splitMegaParagraph(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    // Try to split at sentence boundary (. followed by space or newline)
    const sentenceMatch = remaining.slice(0, maxChars).match(/^([\s\S]*?\.)\s/);

    if (sentenceMatch) {
      chunks.push(sentenceMatch[1]);
      remaining = remaining.slice(sentenceMatch[0].length);
    } else {
      // No sentence boundary, split at last word boundary before maxChars
      const chunk = remaining.slice(0, maxChars);
      const lastSpace = chunk.lastIndexOf(' ');

      if (lastSpace > 0) {
        // Keep the space at the end to satisfy test expectation
        chunks.push(chunk.slice(0, lastSpace + 1));
        remaining = remaining.slice(lastSpace + 1);
      } else {
        // No space found, hard cut at maxChars (pathological case)
        chunks.push(chunk);
        remaining = remaining.slice(maxChars);
      }
    }
  }

  if (remaining && remaining.trim()) {
    chunks.push(remaining.trim());
  }

  return chunks;
}

/**
 * Converts IMSBC scraped sections into chunks suitable for embedding
 * @param sections - Array of scraped HTML sections from scrapeImsbc()
 * @returns Array of plain-text chunks with metadata
 */
export function chunkImsbc(sections: ScrapedSection[]): Chunk[] {
  if (sections.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];

  for (const section of sections) {
    // Convert HTML to plain text (preserves paragraph structure)
    const plainText = htmlToPlainText(section.rawHtml);

    // Skip sections with empty text after stripping
    if (!plainText || plainText.trim().length === 0) {
      continue;
    }

    // Split on SECTION/APPENDIX headings within the text
    const subsections = splitOnHeadings(plainText);

    for (const subsection of subsections) {
      // Split subsection into size-appropriate chunks
      const textChunks = splitIntoChunks(subsection.content);

      // Create chunk objects with metadata
      for (let i = 0; i < textChunks.length; i++) {
        const chunk: Chunk = {
          content: textChunks[i],
          metadata: {
            source: 'imsbc',
            sourceUrl: section.sourceUrl,
            section: section.sectionId,
            title: section.title,
            subsectionIndex: chunks.filter((c) => c.metadata.section === section.sectionId).length,
          },
        };

        chunks.push(chunk);
      }
    }
  }

  return chunks;
}
