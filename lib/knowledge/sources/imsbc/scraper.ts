/**
 * IMSBC Code HTML scraper
 * Spec: spec-12-scrapeimsbc-imsbc-source-url
 *
 * Input Contract:
 * - baseUrl empty/null/undefined → throw 'IMSBC_SOURCE_URL is empty'
 * - baseUrl invalid URL → throw 'Invalid IMSBC_SOURCE_URL: <url>'
 * - baseUrl non-HTTP/HTTPS → throw 'Invalid IMSBC_SOURCE_URL: <url>'
 * - ToC fetch failure → throw 'Failed to fetch IMSBC ToC: <status>'
 * - Section HTML with <script> → strip tag and content
 * - Section fetch failure → log warning, skip section, return partial results
 */

import sanitizeHtml from 'sanitize-html';
import pLimit from 'p-limit';

export interface ScrapedSection {
  sectionId: string;   // e.g. "SECTION-1", "APPENDIX-A"
  title: string;       // e.g. "Section 1 - Definitions"
  rawHtml: string;     // sanitized HTML content (scripts/styles/nav/footer stripped)
  sourceUrl: string;   // full URL of the section page
}

// Legacy interface for backward compatibility
export interface ImsbcSection {
  title: string;
  content: string;
}

const TIMEOUT_MS = 10000;
const MAX_CONCURRENT = 3;

/**
 * Scrapes IMSBC Code from the specified base URL
 * @param baseUrl - Base URL of the IMSBC Code ToC page
 * @returns Array of scraped sections with sanitized HTML
 */
export async function scrapeImsbc(baseUrl: string): Promise<ScrapedSection[]> {
  // Input validation: empty/null/undefined
  if (!baseUrl || baseUrl.trim() === '') {
    throw new Error('IMSBC_SOURCE_URL is empty');
  }

  // Input validation: valid HTTP/HTTPS URL
  let url: URL;
  try {
    url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Invalid IMSBC_SOURCE_URL: ${baseUrl}`);
    }
  } catch {
    throw new Error(`Invalid IMSBC_SOURCE_URL: ${baseUrl}`);
  }

  // Fetch ToC page
  const tocHtml = await fetchWithTimeout(baseUrl, TIMEOUT_MS);
  if (!tocHtml) {
    throw new Error('Failed to fetch IMSBC ToC');
  }

  // Parse ToC to extract section links
  let sectionLinks = extractSectionLinks(tocHtml, baseUrl);

  // Guard: cap sections to prevent ToC DoS via unbounded HTTP requests
  const MAX_SECTIONS = 100;
  if (sectionLinks.length > MAX_SECTIONS) {
    console.warn(`[scrapeImsbc] ToC has ${sectionLinks.length} links, capping at ${MAX_SECTIONS}`);
    sectionLinks = sectionLinks.slice(0, MAX_SECTIONS);
  }

  // Fetch sections with concurrency control
  const limit = pLimit(MAX_CONCURRENT);
  const sections: ScrapedSection[] = [];

  const promises = sectionLinks.map(({ href, text }) =>
    limit(async () => {
      try {
        const sectionHtml = await fetchWithRetry(href, TIMEOUT_MS, 1);
        if (!sectionHtml) {
          console.warn(`Failed to fetch section: ${href}`);
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
        console.warn(`Error fetching section ${href}:`, error);
        return null;
      }
    })
  );

  const results = await Promise.all(promises);
  sections.push(...results.filter((s): s is ScrapedSection => s !== null));

  // Sort by sectionId in natural order
  sections.sort((a, b) => a.sectionId.localeCompare(b.sectionId, undefined, { numeric: true }));

  return sections;
}

/**
 * Fetches URL with timeout using AbortController
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch IMSBC ToC: ${response.status}`);
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
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      console.warn(`Request timeout: ${url}`);
      return null;
    }
    throw error;
  }
}

/**
 * Fetches URL with retry on transient failures
 */
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

      // Guard (Q6): cap section body at 10MB — parity with fetchWithTimeout (ToC).
      // Section pages were previously unguarded; a pathological/malicious mirror
      // could serve a 100MB section and, with MAX_CONCURRENT parallel fetches,
      // land hundreds of MB in process memory before sanitize-html runs. Oversize
      // is not transient → drop the section (return null) rather than retry.
      const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
      const contentLength = response.headers?.get?.('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
        console.warn(`Section response too large: ${contentLength} bytes (max ${MAX_RESPONSE_BYTES}): ${url}`);
        return null;
      }

      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        console.warn(`Section response body too large: ${text.length} chars (max ${MAX_RESPONSE_BYTES}): ${url}`);
        return null;
      }
      return text;
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

/**
 * Extracts section links from ToC HTML
 */
function extractSectionLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];

  // Simple regex-based extraction for <a href="...">...</a> patterns
  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1];
    const text = match[2];

    // Filter for section links (typically INTBSBCC-*.html or similar patterns)
    if (href.includes('.html') || href.includes('.htm')) {
      const fullUrl = new URL(href, baseUrl).toString();
      links.push({ href: fullUrl, text });
    }
  }

  return links;
}

/**
 * Extracts section ID from URL
 */
function extractSectionId(url: string): string {
  const parts = url.split('/');
  const filename = parts[parts.length - 1];

  // Extract meaningful ID from filename
  // e.g., "INTBSBCC-Sec01.html" → "SECTION-1"
  // e.g., "INTBSBCC-Appendix-A.html" → "APPENDIX-A"

  const match = filename.match(/Sec(\d+)|Section[_-]?(\d+)|Appendix[_-]?([A-Z])/i);
  if (match) {
    if (match[1] || match[2]) {
      const num = match[1] || match[2];
      return `SECTION-${num}`;
    }
    if (match[3]) {
      return `APPENDIX-${match[3].toUpperCase()}`;
    }
  }

  // Fallback to sanitized filename
  return filename.replace(/\.html?$/i, '').toUpperCase();
}

/**
 * Sanitizes HTML content: removes dangerous elements and event handlers
 */
function sanitizeHtmlContent(html: string): string {
  // First, manually remove script, style, nav, and footer tags with their content
  let cleaned = html;

  // Remove script tags and content
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove style tags and content
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove nav tags and content
  cleaned = cleaned.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');

  // Remove footer tags and content
  cleaned = cleaned.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');

  // Then use sanitize-html for allowlist enforcement
  return sanitizeHtml(cleaned, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'ul', 'ol', 'li',
      'strong', 'b', 'em', 'i',
      'div', 'span',
      'a', 'img',
    ],
    allowedAttributes: {
      a: ['href'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https'],
  });
}
