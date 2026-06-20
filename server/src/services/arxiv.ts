import axios from 'axios';
import type { SearchResult } from '../types.js';

// ArXiv API rate limit: max 1 request per 3 seconds (by convention)
const ARXIV_INTERVAL_MS = 3000;
let lastRequestTime = 0;

async function waitRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < ARXIV_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, ARXIV_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// AI-related arXiv categories
const AI_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'cs.NE'];

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? decodeXmlEntities(match[1]) : '';
}

/**
 * Search arXiv for recent AI papers.
 * @param query Optional search query (searches title + abstract)
 */
export async function searchArXiv(query?: string): Promise<SearchResult[]> {
  await waitRateLimit();

  try {
    // Build search query
    let searchQuery = AI_CATEGORIES.map(cat => `cat:${cat}`).join('+OR+');

    if (query && query.trim()) {
      const encodedQuery = encodeURIComponent(query.trim());
      searchQuery = `(${searchQuery})+AND+(abs:${encodedQuery}+OR+ti:${encodedQuery})`;
    }

    const url = `http://export.arxiv.org/api/query?search_query=${searchQuery}&sortBy=submittedDate&sortOrder=descending&max_results=20`;

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'HotPulse/1.0 (mailto:dev@example.com)'
      }
    });

    const xmlData = response.data as string;

    // Extract <entry> blocks using regex
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const results: SearchResult[] = [];
    let match;

    while ((match = entryRegex.exec(xmlData)) !== null) {
      const entryXml = match[1];

      const title = extractTag(entryXml, 'title');
      const summary = extractTag(entryXml, 'summary');
      const id = extractTag(entryXml, 'id');
      const published = extractTag(entryXml, 'published');

      // Extract all authors
      const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
      const authors: string[] = [];
      let authorMatch;
      while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
        authors.push(decodeXmlEntities(authorMatch[1]));
      }

      if (!title || !id) continue;

      results.push({
        title,
        content: summary.slice(0, 500) || title,
        url: id, // arXiv URL e.g. http://arxiv.org/abs/2401.12345
        source: 'arxiv' as const,
        sourceId: id.split('/abs/').pop() || id,
        publishedAt: published ? new Date(published) : undefined,
        author: authors.length > 0 ? { name: authors.join(', ') } : undefined,
      });
    }

    console.log(`ArXiv search${query ? ` for "${query}"` : ''}: ${results.length} papers`);
    return results;
  } catch (error) {
    console.error('ArXiv search error:', error instanceof Error ? error.message : error);
    return [];
  }
}
