/**
 * JWC (Joint War Committee) bulletin scraper for RAG knowledge graph.
 * Phase 2: RAG expansion — Block D (JWC RAG), item D1.
 *
 * Fetches JWC Listed Areas bulletins from LMA/Lloyd's website, extracts metadata
 * (id, publishDate, title) and raw text content for downstream embedding.
 */

import type { JwcScrapedBulletin } from './types';

export type { JwcScrapedBulletin };

const TIMEOUT_MS = 10000;
const MAX_CONCURRENT = 3;

/**
 * Scrapes JWC bulletins from the specified base URL.
 *
 * Input Contract (see spec-17 Input Contract table):
 * - Empty/null/whitespace baseUrl → throw Error
 * - Invalid URL → throw on fetch
 * - 404 on listing page → throw Error
 * - Empty HTML → return []
 * - Timeout (>10s) → throw Error
 * - Individual bulletin 500 → skip, log warning, continue
 * - XSS in HTML → strip from rawText
 * - Missing date → fallback or skip with warning
 *
 * @param baseUrl - Base URL for JWC bulletin listing page (e.g. https://www.lmalloyds.com/lma/jointwar)
 * @returns Array of JwcBulletin objects sorted by publishDate descending (newest first)
 * @throws Error if baseUrl is empty/null/whitespace or listing page fetch fails
 */
export async function scrapeJwc(baseUrl: string): Promise<JwcScrapedBulletin[]> {
  if (!baseUrl || baseUrl.trim() === '') {
    throw new Error('baseUrl is required');
  }

  const urlLower = baseUrl.trim().toLowerCase();
  if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
    throw new Error('baseUrl must use http or https');
  }

  const listingHtml = await fetchWithTimeout(baseUrl, TIMEOUT_MS);
  if (!listingHtml || listingHtml.trim() === '') {
    return [];
  }

  let bulletinLinks = extractBulletinLinks(listingHtml, baseUrl);
  if (bulletinLinks.length === 0) {
    return [];
  }

  // Guard: cap bulletins to prevent listing-page DoS via unbounded HTTP requests
  const MAX_BULLETINS = 50;
  if (bulletinLinks.length > MAX_BULLETINS) {
    console.warn(`[scrapeJwc] Listing has ${bulletinLinks.length} links, capping at ${MAX_BULLETINS}`);
    bulletinLinks = bulletinLinks.slice(0, MAX_BULLETINS);
  }

  const bulletins = await fetchBulletinsWithConcurrency(bulletinLinks, MAX_CONCURRENT);
  return bulletins.sort((a, b) => b.publishDate.localeCompare(a.publishDate));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to fetch bulletin listing: ${response.status}`);
    }

    // Guard: size limit to prevent DoS via large responses (max 10MB)
    const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
    const contentLength = response.headers?.get?.('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
      throw new Error(`Response too large: ${contentLength} bytes (max ${MAX_RESPONSE_BYTES})`);
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error(`Response body too large: ${text.length} chars (max ${MAX_RESPONSE_BYTES})`);
    }

    return text;
  } catch (error) {
    clearTimeout(timeout);
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

function extractBulletinLinks(html: string, baseUrl: string): string[] {
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  const links: string[] = [];
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
      links.push(fullUrl);
    }
  }

  return links;
}

async function fetchBulletinsWithConcurrency(
  urls: string[],
  maxConcurrent: number
): Promise<JwcScrapedBulletin[]> {
  const results: JwcScrapedBulletin[] = [];
  const queue = [...urls];

  async function processOne(url: string): Promise<void> {
    try {
      const html = await fetchWithTimeout(url, TIMEOUT_MS);
      const bulletin = parseBulletin(html, url);
      if (bulletin) {
        results.push(bulletin);
      }
    } catch (error) {
      console.warn(`Failed to fetch bulletin ${url}: ${(error as Error).message}`);
    }
  }

  while (queue.length > 0) {
    const batch = queue.splice(0, maxConcurrent);
    await Promise.all(batch.map(processOne));
  }

  return results;
}

function parseBulletin(html: string, sourceUrl: string): JwcScrapedBulletin | null {
  const sanitized = stripTags(html, ['script', 'style', 'nav', 'footer']);
  const title = extractTitle(sanitized);
  const publishDate = extractDate(sanitized);
  const id = extractId(sanitized, sourceUrl);

  if (!publishDate) {
    console.warn(`Missing date for bulletin ${sourceUrl}, skipping`);
    return null;
  }

  const rawText = htmlToPlainText(sanitized);

  return {
    id: id || `jwc-${Date.now()}`,
    publishDate,
    title: title || 'Untitled Bulletin',
    rawText,
    sourceUrl,
  };
}

function stripTags(html: string, tagNames: string[]): string {
  let result = html;
  for (const tag of tagNames) {
    const pattern = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gis');
    result = result.replace(pattern, '');
  }
  return result;
}

function extractTitle(html: string): string | null {
  const h1Match = /<h1[^>]*>(.*?)<\/h1>/i.exec(html);
  if (h1Match) {
    return htmlToPlainText(h1Match[1]).trim();
  }
  const titleMatch = /<title[^>]*>(.*?)<\/title>/i.exec(html);
  if (titleMatch) {
    return htmlToPlainText(titleMatch[1]).trim();
  }
  return null;
}

function extractDate(html: string): string | null {
  const timeMatch = /<time[^>]*>(.*?)<\/time>/i.exec(html);
  if (timeMatch) {
    return timeMatch[1].trim();
  }

  const datePatterns = [
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/,
  ];

  for (const pattern of datePatterns) {
    const match = pattern.exec(html);
    if (match) {
      return normalizeDate(match[1]);
    }
  }

  return null;
}

function normalizeDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {
    // Fallback handled below
  }

  return dateStr;
}

function extractId(html: string, sourceUrl: string): string | null {
  const idMatch = /JWLA-(\d+)/i.exec(html);
  if (idMatch) {
    return `JWLA-${idMatch[1]}`;
  }

  const urlMatch = /\/([^\/]+)$/.exec(sourceUrl);
  if (urlMatch) {
    return urlMatch[1];
  }

  return null;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
