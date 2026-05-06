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
 */
function htmlToPlainText(html: string): string {
  // First, strip dangerous elements
  let text = stripDangerousElements(html);

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

  // Normalize whitespace: collapse multiple spaces/newlines into single space
  text = text.replace(/\s+/g, ' ').trim();

  return text;
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
    // Convert HTML to plain text
    const plainText = htmlToPlainText(section.rawHtml);

    // Skip sections with empty text after stripping
    if (!plainText || plainText.trim().length === 0) {
      continue;
    }

    // For now, create a single chunk per section (TODO: implement splitting logic)
    const chunk: Chunk = {
      content: plainText,
      metadata: {
        source: 'imsbc',
        sourceUrl: section.sourceUrl,
        section: section.sectionId,
        title: section.title,
        subsectionIndex: 0,
      },
    };

    chunks.push(chunk);
  }

  return chunks;
}
