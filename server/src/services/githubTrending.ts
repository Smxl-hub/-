import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.js';

// Rate limiting
const GITHUB_INTERVAL_MS = 10000; // 10s between requests
let lastRequestTime = 0;

async function waitRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < GITHUB_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, GITHUB_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function getRandomUserAgent(): string {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

function parseStarCount(text: string): number {
  // Handle "12.5k", "1.2k", "123" formats
  const cleaned = text.replace(/,/g, '').trim();
  if (cleaned.toLowerCase().endsWith('k')) {
    return Math.round(parseFloat(cleaned) * 1000);
  }
  return parseInt(cleaned, 10) || 0;
}

/**
 * Scrape GitHub Trending page (weekly).
 * Returns trending repos — no API key needed.
 */
async function scrapeTrending(): Promise<SearchResult[]> {
  await waitRateLimit();

  try {
    const response = await axios.get(
      'https://github.com/trending?since=weekly&spoken_language_code=en',
      {
        timeout: 15000,
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      }
    );

    // Detect rate limiting / login wall
    if (response.data.includes('sign-in') || response.data.includes('log in')) {
      console.warn('  GitHub Trending: rate limited, falling back to API');
      return [];
    }

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('article.Box-row').each((_, element) => {
      const titleEl = $(element).find('h2 a');
      const repoPath = titleEl.text().replace(/\s+/g, '').trim(); // "owner / repo" -> "owner/repo"
      const href = titleEl.attr('href') || '';
      const description = $(element).find('p').text().trim();

      // Extract star/fork counts
      const starText = $(element).find('a[href*="/stargazers"]').text().trim();
      const forkText = $(element).find('a[href*="/forks"]').text().trim();

      // Extract language
      const language = $(element).find('[itemprop="programmingLanguage"]').text().trim();

      if (!repoPath || !href) return;

      const url = `https://github.com${href}`;
      const stars = parseStarCount(starText);
      const forks = parseStarCount(forkText);
      const owner = repoPath.split('/')[0] || '';

      // AI-related language filter or accept all for trending
      const title = `${repoPath}${description ? ': ' + description.slice(0, 80) : ''}`;
      const content = [
        description,
        language ? `Language: ${language}` : '',
        stars ? `⭐ ${stars.toLocaleString()}` : '',
        forks ? `🍴 ${forks.toLocaleString()}` : '',
      ].filter(Boolean).join(' | ');

      results.push({
        title,
        content: content || repoPath,
        url,
        source: 'github' as const,
        sourceId: repoPath,
        viewCount: stars,
        author: { name: owner },
      });
    });

    console.log(`  GitHub Trending: ${results.length} repos (weekly)`);
    return results;
  } catch (error) {
    console.error('  GitHub Trending scrape error:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Search GitHub repositories via official Search API (free, no auth).
 * More reliable than scraping for keyword-based search.
 */
async function searchGitHubAPI(query: string): Promise<SearchResult[]> {
  await waitRateLimit();

  try {
    // Search recent repos related to AI, sorted by stars
    const encodedQuery = encodeURIComponent(`${query} ai OR artificial-intelligence OR machine-learning`);
    const response = await axios.get(
      `https://api.github.com/search/repositories?q=${encodedQuery}&sort=stars&order=desc&per_page=20`,
      {
        timeout: 15000,
        headers: {
          'User-Agent': 'HotPulse/1.0',
          'Accept': 'application/vnd.github.v3+json',
        }
      }
    );

    const items = response.data?.items;
    if (!Array.isArray(items)) {
      return [];
    }

    const results: SearchResult[] = items.map((repo: any) => ({
      title: `${repo.full_name}: ${(repo.description || '').slice(0, 100)}`,
      content: [
        repo.description,
        repo.language ? `Language: ${repo.language}` : '',
        repo.stargazers_count ? `⭐ ${repo.stargazers_count.toLocaleString()}` : '',
        repo.forks_count ? `🍴 ${repo.forks_count.toLocaleString()}` : '',
      ].filter(Boolean).join(' | '),
      url: repo.html_url,
      source: 'github' as const,
      sourceId: repo.full_name,
      viewCount: repo.stargazers_count,
      author: {
        name: repo.owner?.login || '',
        avatar: repo.owner?.avatar_url,
      },
    }));

    console.log(`  GitHub API search for "${query}": ${results.length} repos`);
    return results;
  } catch (error) {
    console.error('  GitHub API search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Get GitHub trending repositories and/or search for AI-related repos.
 * @param query Optional keyword search. If omitted, returns weekly trending.
 */
export async function searchGitHubTrending(query?: string): Promise<SearchResult[]> {
  console.log('📡 Fetching GitHub...');

  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  // Always include trending (general discovery)
  const trendingResults = await scrapeTrending();
  for (const r of trendingResults) {
    const normalized = r.url.replace(/\/$/, '').toLowerCase();
    if (!seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      allResults.push(r);
    }
  }

  // If query provided, also search via API
  if (query && query.trim()) {
    const apiResults = await searchGitHubAPI(query.trim());
    for (const r of apiResults) {
      const normalized = r.url.replace(/\/$/, '').toLowerCase();
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        allResults.push(r);
      }
    }
  }

  console.log(`📡 GitHub total: ${allResults.length} repos`);
  return allResults;
}
