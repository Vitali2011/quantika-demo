/**
 * IGC (International Grain Code) HTML scraper
 *
 * Scrapes imorules.com/INTGRAIN.html (listing) + individual section pages.
 * Structure mirrors IMSBC scraper — same site, GUID-based section URLs.
 *
 * Input Contract:
 * - baseUrl empty/null/undefined → throw 'IGC_SOURCE_URL is empty'
 * - baseUrl invalid URL → throw 'Invalid IGC_SOURCE_URL: <url>'
 * - baseUrl non-HTTP/HTTPS → throw 'Invalid IGC_SOURCE_URL: <url>'
 * - ToC fetch failure → throw 'Failed to fetch IGC ToC: <status>'
 * - Section HTML with <script> → strip tag and content
 * - Section fetch failure → log warning, skip section, return partial results
 */

import sanitizeHtml from 'sanitize-html';
import pLimit from 'p-limit';

export interface ScrapedSection {
  sectionId: string;
  title: string;
  rawHtml: string;
  sourceUrl: string;
}

const TIMEOUT_MS = 10000;
const MAX_CONCURRENT = 3;
const MAX_SECTIONS = 50; // IGC has ~20 sections; generous cap

export async function scrapeIgc(baseUrl: string): Promise<ScrapedSection[]> {
  if (!baseUrl || baseUrl.trim() === '') {
    throw new Error('IGC_SOURCE_URL is empty');
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Invalid IGC_SOURCE_URL: ${baseUrl}`);
    }
  } catch {
    throw new Error(`Invalid IGC_SOURCE_URL: ${baseUrl}`);
  }

  const tocHtml = await fetchWithTimeout(baseUrl, TIMEOUT_MS);
  if (!tocHtml) {
    throw new Error('Failed to fetch IGC ToC');
  }

  // Level 1: top-level parent pages (Part A, Part B, Appendix…)
  const parentLinks = extractSectionLinks(tocHtml, baseUrl);

  // Level 2: for each parent page, collect its leaf section links.
  // imorules.com IGC uses a two-level hierarchy:
  //   INTGRAIN.html → INTGRAIN_PTA.html / INTGRAIN_PTB.html / Appendix…
  //   INTGRAIN_PTA.html → 18 leaf section pages (actual regulatory text)
  const limit = pLimit(MAX_CONCURRENT);

  const leafCollectionPromises = parentLinks.map(({ href }) =>
    limit(async () => {
      try {
        const parentHtml = await fetchWithRetry(href, TIMEOUT_MS, 1);
        if (!parentHtml) return null;
        const children = extractSectionLinks(parentHtml, baseUrl);
        return children.length > 0 ? children : null;
      } catch {
        return null;
      }
    })
  );

  const leafResults = await Promise.all(leafCollectionPromises);

  // Build de-duplicated flat list of leaf links.
  // If a parent had children, use children. Otherwise fall back to the parent URL itself.
  const seen = new Set<string>();
  const leafLinks: Array<{ href: string; text: string }> = [];

  for (let i = 0; i < parentLinks.length; i++) {
    const children = leafResults[i];
    const candidates = children ?? [parentLinks[i]];
    for (const link of candidates) {
      const normalised = link.href.split('#')[0]; // strip fragment
      if (!seen.has(normalised)) {
        seen.add(normalised);
        leafLinks.push({ href: normalised, text: link.text });
      }
    }
  }

  const cappedLinks = leafLinks.length > MAX_SECTIONS ? leafLinks.slice(0, MAX_SECTIONS) : leafLinks;
  if (leafLinks.length > MAX_SECTIONS) {
    console.warn(`[scrapeIgc] ${leafLinks.length} leaf links, capping at ${MAX_SECTIONS}`);
  }

  const limit2 = pLimit(MAX_CONCURRENT);
  const sections: ScrapedSection[] = [];

  const sectionPromises = cappedLinks.map(({ href, text }) =>
    limit2(async () => {
      try {
        const sectionHtml = await fetchWithRetry(href, TIMEOUT_MS, 1);
        if (!sectionHtml) {
          console.warn(`Failed to fetch IGC section: ${href}`);
          return null;
        }

        const sanitized = sanitizeHtmlContent(sectionHtml);
        const sectionId = extractSectionId(href);

        return {
          sectionId,
          title: text.trim(),
          rawHtml: sanitized,
          sourceUrl: href,
        };
      } catch (error) {
        console.warn(`Error fetching IGC section ${href}:`, error);
        return null;
      }
    })
  );

  const results = await Promise.all(sectionPromises);
  sections.push(...results.filter((s): s is ScrapedSection => s !== null));

  sections.sort((a, b) => a.sectionId.localeCompare(b.sectionId, undefined, { numeric: true }));

  return sections;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch IGC ToC: ${response.status}`);
    }

    const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
    const contentLength = response.headers?.get?.('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
      throw new Error(`Response too large: ${contentLength} bytes`);
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error(`Response body too large: ${text.length} chars`);
    }

    return text;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      console.warn(`Request timeout: ${url}`);
      return null;
    }
    throw error;
  }
}

async function fetchWithRetry(url: string, timeoutMs: number, retries: number): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        return null;
      }

      return await response.text();
    } catch (error) {
      if (attempt < retries && (error as Error).name !== 'AbortError') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      return null;
    }
  }
  return null;
}

function extractSectionLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];

  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1];
    const text = match[2];

    if (href.includes('.html') || href.includes('.htm')) {
      const fullUrl = new URL(href, baseUrl).toString();
      links.push({ href: fullUrl, text });
    }
  }

  return links;
}

function extractSectionId(url: string): string {
  const parts = url.split('/');
  const filename = parts[parts.length - 1];

  const match = filename.match(/Sec(\d+)|Section[_-]?(\d+)|Appendix[_-]?([A-Z])|Part[_-]?([A-Z])/i);
  if (match) {
    if (match[1] || match[2]) {
      return `SECTION-${match[1] || match[2]}`;
    }
    if (match[3]) return `APPENDIX-${match[3].toUpperCase()}`;
    if (match[4]) return `PART-${match[4].toUpperCase()}`;
  }

  return filename.replace(/\.html?$/i, '').toUpperCase();
}

function sanitizeHtmlContent(html: string): string {
  let cleaned = html;
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  cleaned = cleaned.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
  cleaned = cleaned.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');

  return sanitizeHtml(cleaned, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'ul', 'ol', 'li',
      'strong', 'b', 'em', 'i',
      'div', 'span', 'a', 'img',
    ],
    allowedAttributes: {
      a: ['href'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https'],
  });
}
