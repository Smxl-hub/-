import Parser from 'rss-parser';
import axios from 'axios';
import type { SearchResult } from '../types.js';

// ProductHunt: RSS-based (free, no API key) + optional GraphQL API (needs token)
const PH_INTERVAL_MS = 60000; // 60s — be very polite
let lastRequestTime = 0;

async function waitRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < PH_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, PH_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// AI-related keywords to filter ProductHunt feed
const AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'llm', 'gpt',
  'chatgpt', 'openai', 'claude', 'anthropic', 'gemini', 'deepseek',
  'copilot', 'agent', 'rag', 'vector', 'embedding', 'fine-tuning',
  'neural', 'transformer', 'diffusion', 'stable diffusion', 'midjourney',
  'langchain', 'llama', 'mistral', 'nlp', 'computer vision',
  'generative', 'prompt', 'chatbot', 'automation', 'workflow',
];

function isAiRelated(title: string, description: string): boolean {
  const text = (title + ' ' + description).toLowerCase();
  return AI_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * Fetch ProductHunt products via RSS feed (free, no auth).
 * Filters for AI-related products.
 */
async function fetchRSS(): Promise<SearchResult[]> {
  const parser = new Parser({
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HotPulse/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
  });

  try {
    const feed = await parser.parseURL('https://www.producthunt.com/feed');

    if (!feed.items || feed.items.length === 0) {
      console.log('  ProductHunt RSS: no items');
      return [];
    }

    const results: SearchResult[] = [];

    for (const item of feed.items) {
      if (!item.title || !item.link) continue;

      const description = item.contentSnippet || item.content || '';

      // Filter for AI-related products
      if (!isAiRelated(item.title, description)) continue;

      results.push({
        title: item.title.split(' - ')[0]?.trim() || item.title, // Clean up PH naming convention "ProductName - Tagline"
        content: (description || item.title).slice(0, 300),
        url: item.link,
        source: 'producthunt' as const,
        sourceId: item.guid || item.link || undefined,
        publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
        author: item.creator ? { name: item.creator } : undefined,
      });
    }

    console.log(`  ProductHunt RSS: ${results.length} AI-related products`);
    return results;
  } catch (error) {
    console.error('  ProductHunt RSS error:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Fetch ProductHunt products via GraphQL API (requires PRODUCTHUNT_TOKEN in .env).
 * More precise than RSS with topic filtering.
 */
async function fetchGraphQL(): Promise<SearchResult[]> {
  const token = (process.env.PRODUCTHUNT_TOKEN || '').trim();
  if (!token) {
    return []; // Silently skip — RSS will be used as fallback
  }

  try {
    const query = `
      query {
        posts(first: 20, topic: "artificial-intelligence", order: NEWEST) {
          edges {
            node {
              id
              name
              tagline
              url
              votesCount
              commentsCount
              createdAt
              user {
                name
                username
                profileImage
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      'https://api.producthunt.com/v2/api/graphql',
      { query },
      {
        timeout: 15000,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'HotPulse/1.0',
        }
      }
    );

    const posts = response.data?.data?.posts?.edges;
    if (!Array.isArray(posts)) {
      return [];
    }

    const results: SearchResult[] = posts
      .map((edge: any) => edge.node)
      .filter((node: any) => node?.name && node?.url)
      .map((node: any) => ({
        title: `${node.name}: ${node.tagline || ''}`,
        content: node.tagline || node.name,
        url: node.url,
        source: 'producthunt' as const,
        sourceId: node.id,
        publishedAt: node.createdAt ? new Date(node.createdAt) : undefined,
        likeCount: node.votesCount,
        commentCount: node.commentsCount,
        author: node.user ? {
          name: node.user.name,
          username: node.user.username,
          avatar: node.user.profileImage,
        } : undefined,
      }));

    console.log(`  ProductHunt GraphQL: ${results.length} AI products`);
    return results;
  } catch (error) {
    console.error('  ProductHunt GraphQL error:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Search ProductHunt for recent AI products.
 * Tries GraphQL API first (if token configured), falls back to RSS.
 */
export async function searchProductHunt(): Promise<SearchResult[]> {
  await waitRateLimit();
  console.log('📡 Fetching ProductHunt...');

  // Try GraphQL first (more precise), fall back to RSS
  const graphqlResults = await fetchGraphQL();
  if (graphqlResults.length > 0) {
    console.log(`📡 ProductHunt total: ${graphqlResults.length} products (GraphQL)`);
    return graphqlResults;
  }

  // Fallback to RSS
  const rssResults = await fetchRSS();
  console.log(`📡 ProductHunt total: ${rssResults.length} products (RSS)`);
  return rssResults;
}
