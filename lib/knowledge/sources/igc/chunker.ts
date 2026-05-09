/**
 * IGC (International Grain Code) chunker
 * Converts scraped HTML sections into plain-text chunks for embedding.
 * Logic mirrors IMSBC chunker — same site HTML structure.
 */

import type { Chunk } from '@/lib/knowledge/embeddings/chunks';
import type { ScrapedSection } from './scraper';

function stripDangerousElements(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>[\s\S]*?<\/embed>/gi, '');
}

function htmlToPlainText(html: string): string {
  let text = stripDangerousElements(html);

  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '$1\n\n');
  text = text.replace(/<\/p>/gi, '</p>\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/div>/gi, '</div>\n\n');
  text = text.replace(/<[^>]+>/g, ' ');

  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Strip C0/C1 control chars (keep \t=U+0009, \n=U+000A, \r=U+000D)
  // Removes: NUL(U+0000)–BS(U+0008), VT(U+000B), FF(U+000C), SO(U+000E)–US(U+001F), DEL(U+007F), C1(U+0080–U+009F)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  text = text.replace(/[​-‏‪-‮⁦-⁩﻿]/g, '');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

function splitOnHeadings(text: string): Array<{ heading: string; content: string }> {
  const headingRegex = /(?:^|\n)\s*(SECTION\s+\d+|APPENDIX\s+[A-Z]|PART\s+[A-Z])(?:\s|$)/gim;
  const matches = Array.from(text.matchAll(headingRegex));

  if (matches.length === 0) {
    return [{ heading: '', content: text }];
  }

  const sections: Array<{ heading: string; content: string }> = [];

  const firstMatch = matches[0];
  if (firstMatch.index! > 0) {
    const preContent = text.slice(0, firstMatch.index!).trim();
    if (preContent) {
      sections.push({ heading: '', content: preContent });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const heading = match[1];
    const startIdx = match.index! + match[0].length;
    const endIdx = i < matches.length - 1 ? matches[i + 1].index! : text.length;
    const content = text.slice(startIdx, endIdx).trim();

    if (content) {
      sections.push({ heading, content });
    }
  }

  return sections.length > 0 ? sections : [{ heading: '', content: text }];
}

function splitIntoChunks(text: string): string[] {
  const HARD_CAP_CHARS = 8000;
  const TARGET_MAX_CHARS = 2400;

  if (text.length <= TARGET_MAX_CHARS) {
    return [text];
  }

  const chunks: string[] = [];
  const paragraphs = text.split('\n\n').filter((p) => p.trim().length > 0);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > HARD_CAP_CHARS) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      chunks.push(...splitMegaParagraph(paragraph, HARD_CAP_CHARS));
      continue;
    }

    const testChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;

    if (testChunk.length <= HARD_CAP_CHARS) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());

  return chunks.length > 0 ? chunks : [text];
}

function splitMegaParagraph(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const sentenceMatch = remaining.slice(0, maxChars).match(/^([\s\S]*?\.)\s/);

    if (sentenceMatch) {
      chunks.push(sentenceMatch[1]);
      remaining = remaining.slice(sentenceMatch[0].length);
    } else {
      const chunk = remaining.slice(0, maxChars);
      const lastSpace = chunk.lastIndexOf(' ');

      if (lastSpace > 0) {
        chunks.push(chunk.slice(0, lastSpace + 1));
        remaining = remaining.slice(lastSpace + 1);
      } else {
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

export function chunkIgc(sections: ScrapedSection[]): Chunk[] {
  if (sections.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];

  for (const section of sections) {
    const plainText = htmlToPlainText(section.rawHtml);

    if (!plainText || plainText.trim().length === 0) {
      continue;
    }

    const subsections = splitOnHeadings(plainText);

    for (const subsection of subsections) {
      const textChunks = splitIntoChunks(subsection.content);

      for (let i = 0; i < textChunks.length; i++) {
        const chunk: Chunk = {
          content: textChunks[i],
          metadata: {
            source: 'igc',
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
