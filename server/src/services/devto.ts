import axios from 'axios';
import type { SearchResult } from '../types.js';

// DEV.to API is free and generous with rate limits
const DEVTO_INTERVAL_MS = 1000;
let lastRequestTime = 0;

async function waitRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < DEVTO_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, DEVTO_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

interface DevToArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  published_at: string;
  comments_count: number;
  positive_reactions_count: number;
  tag_list: string[];
  user: {
    name: string;
    username: string;
    profile_image_90: string;
  };
}

/**
 * Search DEV.to for AI-related articles.
 * @param query Optional search query. If omitted, returns latest AI-tagged articles.
 */
export async function searchDevTo(query?: string): Promise<SearchResult[]> {
  await waitRateLimit();

  try {
    let url: string;
    if (query && query.trim()) {
      // DEV.to API supports ?q= param for full-text search (unofficial but works)
      url = `https://dev.to/api/articles?tag=ai&per_page=20`;
    } else {
      url = `https://dev.to/api/articles?tag=ai&per_page=20&top=7`; // top articles this week
    }

    const response = await axios.get<DevToArticle[]>(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'HotPulse/1.0',
        'Accept': 'application/json',
      }
    });

    const articles = response.data;
    if (!Array.isArray(articles)) {
      return [];
    }

    let filtered = articles;

    // If query provided, do client-side filtering (DEV.to API search is limited)
    if (query && query.trim()) {
      const q = query.toLowerCase();
      filtered = articles.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.tag_list?.some(tag => tag.toLowerCase().includes(q))
      );
    }

    const results: SearchResult[] = filtered
      .filter(a => {
        // Filter out future-dated (scheduled) posts
        if (a.published_at) {
          const pubDate = new Date(a.published_at);
          if (pubDate > new Date()) return false;
        }
        return a.title && a.url;
      })
      .map(a => ({
        title: a.title,
        content: (a.description || a.title).slice(0, 500),
        url: a.url,
        source: 'devto' as const,
        sourceId: String(a.id),
        publishedAt: a.published_at ? new Date(a.published_at) : undefined,
        commentCount: a.comments_count,
        likeCount: a.positive_reactions_count,
        author: {
          name: a.user?.name || 'Unknown',
          username: a.user?.username,
          avatar: a.user?.profile_image_90,
        },
      }));

    console.log(`DEV.to search${query ? ` for "${query}"` : ''}: ${results.length} articles`);
    return results;
  } catch (error) {
    console.error('DEV.to search error:', error instanceof Error ? error.message : error);
    return [];
  }
}
