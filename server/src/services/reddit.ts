import axios from 'axios';
import type { SearchResult } from '../types.js';

// AI-related subreddits
const AI_SUBREDDITS = [
  'MachineLearning',
  'artificial',
  'LocalLLaMA',
  'OpenAI',
  'singularity',
];

// Rate limiting
const REDDIT_INTERVAL_MS = 2000; // 2s between requests (Reddit allows ~60/min)

let lastRequestTime = 0;
async function waitRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < REDDIT_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, REDDIT_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function getRandomUserAgent(): string {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    author: string;
    score: number;
    num_comments: number;
    ups: number;
    created_utc: number;
    over_18: boolean;
    stickied: boolean;
  };
}

interface RedditListing {
  data: {
    children: RedditPost[];
  };
}

/**
 * Fetch hot posts from a single subreddit.
 */
async function fetchSubreddit(subreddit: string): Promise<SearchResult[]> {
  await waitRateLimit();

  try {
    const response = await axios.get<RedditListing>(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=25&raw_json=1`,
      {
        timeout: 15000,
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/json',
        }
      }
    );

    if (!response.data?.data?.children) {
      return [];
    }

    const results: SearchResult[] = [];

    for (const child of response.data.data.children) {
      const post = child.data;

      // Skip stickied, NSFW, and posts with no real content
      if (post.stickied || post.over_18) continue;
      if (!post.title) continue;

      // Use selftext for text posts, otherwise use title
      let content = post.selftext || '';
      if (content === '[removed]' || content === '[deleted]') {
        content = '';
      }

      // Determine URL: use external link if available, otherwise Reddit permalink
      const externalUrl = post.url;
      const isRedditLink = externalUrl.startsWith('https://www.reddit.com') || externalUrl.startsWith('/r/');
      const url = isRedditLink ? `https://www.reddit.com${post.permalink}` : externalUrl;

      results.push({
        title: post.title,
        content: content.slice(0, 500) || post.title,
        url,
        source: 'reddit' as const,
        sourceId: post.id,
        publishedAt: new Date(post.created_utc * 1000),
        score: post.score,
        commentCount: post.num_comments,
        viewCount: post.ups,
        author: {
          name: post.author,
          username: post.author,
        },
      });
    }

    console.log(`  Reddit r/${subreddit}: ${results.length} posts`);
    return results;
  } catch (error) {
    console.error(`  Reddit r/${subreddit} error:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Search Reddit for posts matching a query.
 */
async function searchRedditPosts(query: string): Promise<SearchResult[]> {
  await waitRateLimit();

  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await axios.get<RedditListing>(
      `https://www.reddit.com/search.json?q=${encodedQuery}&sort=new&t=week&limit=25&raw_json=1`,
      {
        timeout: 15000,
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/json',
        }
      }
    );

    if (!response.data?.data?.children) {
      return [];
    }

    const results: SearchResult[] = [];

    for (const child of response.data.data.children) {
      const post = child.data;
      if (!post.title) continue;

      let content = post.selftext || '';
      if (content === '[removed]' || content === '[deleted]') content = '';

      const isSelfPost = post.url?.startsWith('https://www.reddit.com') || post.url?.startsWith('/r/');
      const url = isSelfPost ? `https://www.reddit.com${post.permalink}` : post.url;

      results.push({
        title: post.title,
        content: content.slice(0, 500) || post.title,
        url,
        source: 'reddit' as const,
        sourceId: post.id,
        publishedAt: new Date(post.created_utc * 1000),
        score: post.score,
        commentCount: post.num_comments,
        viewCount: post.ups,
        author: { name: post.author, username: post.author },
      });
    }

    console.log(`Reddit search for "${query}": ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Reddit search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Fetch AI-related Reddit content.
 * @param query Optional search query. If omitted, fetches hot posts from AI subreddits.
 */
export async function searchReddit(query?: string): Promise<SearchResult[]> {
  if (query && query.trim()) {
    return searchRedditPosts(query.trim());
  }

  console.log('📡 Fetching Reddit AI subreddits...');
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const sub of AI_SUBREDDITS) {
    const results = await fetchSubreddit(sub);
    for (const r of results) {
      const normalized = r.url.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        allResults.push(r);
      }
    }
  }

  console.log(`📡 Reddit total: ${allResults.length} unique posts from ${AI_SUBREDDITS.length} subs`);
  return allResults;
}
