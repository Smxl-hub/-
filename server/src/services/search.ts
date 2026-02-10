import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.js';

// User Agent 列表
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

// 频率限制器
class RateLimiter {
  private lastRequestTime = 0;
  private minInterval: number;

  constructor(minIntervalMs: number = 5000) {
    this.minInterval = minIntervalMs;
  }

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}

const bingLimiter = new RateLimiter(5000);
const googleLimiter = new RateLimiter(10000);

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function searchBing(query: string): Promise<SearchResult[]> {
  await bingLimiter.wait();

  try {
    const response = await axios.get('https://www.bing.com/search', {
      params: {
        q: query,
        count: 20
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('li.b_algo').each((_, element) => {
      const titleElement = $(element).find('h2 a');
      const title = titleElement.text().trim();
      const url = titleElement.attr('href');
      const snippet = $(element).find('.b_caption p').text().trim();

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          content: snippet,
          url,
          source: 'bing'
        });
      }
    });

    console.log(`Bing search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Bing search error:', error);
    return [];
  }
}

export async function searchGoogle(query: string): Promise<SearchResult[]> {
  await googleLimiter.wait();

  try {
    const response = await axios.get('https://www.google.com/search', {
      params: {
        q: query,
        num: 20,
        hl: 'en'
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('div.g').each((_, element) => {
      const titleElement = $(element).find('h3').first();
      const title = titleElement.text().trim();
      const linkElement = $(element).find('a').first();
      const url = linkElement.attr('href');
      const snippet = $(element).find('.VwiC3b').text().trim();

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          content: snippet,
          url,
          source: 'google'
        });
      }
    });

    console.log(`Google search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Google search error:', error);
    return [];
  }
}

// 聚合搜索
export async function searchAll(query: string): Promise<SearchResult[]> {
  const results = await Promise.allSettled([
    searchBing(query),
    // Google 搜索作为备选
    // searchGoogle(query) 
  ]);

  const allResults: SearchResult[] = [];
  
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  });

  // 去重
  const uniqueUrls = new Set<string>();
  return allResults.filter(item => {
    if (uniqueUrls.has(item.url)) {
      return false;
    }
    uniqueUrls.add(item.url);
    return true;
  });
}
