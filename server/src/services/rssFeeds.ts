import Parser from 'rss-parser';
import type { SearchResult } from '../types.js';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; HotPulse/1.0; +https://github.com)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  }
});

// AI/Tech blog RSS feeds — all free, no API key needed
const FEEDS = [
  { url: 'https://openai.com/news/rss.xml',              name: 'OpenAI Blog',       category: 'ai' },
  { url: 'https://deepmind.google/blog/rss.xml',          name: 'Google DeepMind',  category: 'ai' },
  { url: 'https://blog.google/technology/ai/rss/',        name: 'Google AI Blog',   category: 'ai' },
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', name: 'TechCrunch AI', category: 'ai' },
  { url: 'https://venturebeat.com/category/ai/feed/',     name: 'VentureBeat AI',   category: 'ai' },
  { url: 'https://www.theverge.com/ai-artificial-intelligence/rss.xml', name: 'The Verge AI', category: 'ai' },
  { url: 'https://arstechnica.com/ai/feed/',              name: 'Ars Technica AI',  category: 'tech' },
  { url: 'https://www.marktechpost.com/feed/',            name: 'MarkTechPost',     category: 'ai' },
  { url: 'https://www.technologyreview.com/feed/',        name: 'MIT Tech Review',  category: 'tech' },
];

// Rate limiter — be polite to RSS hosts
const FEED_INTERVAL_MS = 5000;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function fetchSingleFeed(feedUrl: string, feedName: string): Promise<SearchResult[]> {
  try {
    const feed = await parser.parseURL(feedUrl);

    if (!feed.items || feed.items.length === 0) {
      console.log(`  RSS [${feedName}]: no items`);
      return [];
    }

    const results: SearchResult[] = [];

    for (const item of feed.items) {
      if (!item.title || !item.link) continue;

      const contentRaw = item.contentSnippet || item.content || item.summary || '';
      const content = contentRaw ? stripHtml(decodeEntities(contentRaw)).slice(0, 500) : item.title;

      results.push({
        title: decodeEntities(item.title).trim(),
        content: content || item.title,
        url: item.link,
        source: 'rss' as const,
        sourceId: item.guid || item.link || undefined,
        publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
        author: item.creator ? { name: item.creator } : undefined,
      });
    }

    console.log(`  RSS [${feedName}]: ${results.length} items`);
    return results;
  } catch (error) {
    console.error(`  RSS [${feedName}] error:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Fetch all AI blog RSS feeds, aggregate and deduplicate by URL.
 * Returns SearchResult[] with source='rss'.
 */
export async function fetchAllFeeds(): Promise<SearchResult[]> {
  console.log('📡 Fetching RSS feeds...');
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const feed of FEEDS) {
    const results = await fetchSingleFeed(feed.url, feed.name);

    // Deduplicate within RSS batch
    for (const r of results) {
      const normalized = r.url.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        allResults.push(r);
      }
    }

    // Rate limit between feeds
    await new Promise(resolve => setTimeout(resolve, FEED_INTERVAL_MS));
  }

  console.log(`📡 RSS total: ${allResults.length} unique items from ${FEEDS.length} feeds`);
  return allResults;
}

/**
 * Fetch a single RSS feed by URL (for manual search / testing).
 */
export async function fetchFeed(url: string): Promise<SearchResult[]> {
  return fetchSingleFeed(url, 'custom');
}
