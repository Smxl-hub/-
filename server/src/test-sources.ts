/**
 * Test each search source for availability.
 * Run: npx tsx src/test-sources.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { searchTwitter } from './services/twitter.js';
import { searchBing, searchGoogle, searchDuckDuckGo, searchHackerNews } from './services/search.js';
import { fetchAllFeeds } from './services/rssFeeds.js';
import { searchArXiv } from './services/arxiv.js';
import { searchReddit } from './services/reddit.js';
import { searchDevTo } from './services/devto.js';
import { searchProductHunt } from './services/producthunt.js';
import { searchGitHubTrending } from './services/githubTrending.js';

const TEST_QUERY = 'Codex';

async function testSource(name: string, fn: () => Promise<any[]>) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing: ${name}`);
  console.log(`${'='.repeat(50)}`);
  try {
    const start = Date.now();
    const results = await fn();
    const elapsed = Date.now() - start;
    console.log(`✅ ${name}: ${results.length} results (${elapsed}ms)`);
    if (results.length > 0) {
      // Print first 3
      results.slice(0, 3).forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.title?.slice(0, 60)}`);
        console.log(`      URL: ${r.url?.slice(0, 80)}`);
        console.log(`      Source: ${r.source}, Published: ${r.publishedAt || 'N/A'}`);
      });
    }
    return { name, success: true, count: results.length, elapsed };
  } catch (error) {
    console.log(`❌ ${name}: ERROR - ${error instanceof Error ? error.message : error}`);
    return { name, success: false, count: 0, elapsed: 0 };
  }
}

async function main() {
  console.log(`\n🔍 Testing all search sources with query: "${TEST_QUERY}"\n`);

  const results = [];

  // International search engines
  results.push(await testSource('Twitter', () => searchTwitter(TEST_QUERY)));
  results.push(await testSource('Bing', () => searchBing(TEST_QUERY)));
  results.push(await testSource('Google', () => searchGoogle(TEST_QUERY)));
  results.push(await testSource('DuckDuckGo', () => searchDuckDuckGo(TEST_QUERY)));
  results.push(await testSource('HackerNews', () => searchHackerNews(TEST_QUERY)));

  // New data sources
  results.push(await testSource('RSS Feeds', () => fetchAllFeeds()));
  results.push(await testSource('ArXiv', () => searchArXiv(TEST_QUERY)));
  results.push(await testSource('Reddit', () => searchReddit(TEST_QUERY)));
  results.push(await testSource('DEV.to', () => searchDevTo(TEST_QUERY)));
  results.push(await testSource('ProductHunt', () => searchProductHunt()));
  results.push(await testSource('GitHub Trending', () => searchGitHubTrending(TEST_QUERY)));

  console.log(`\n${'='.repeat(50)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(50)}`);
  let successCount = 0;
  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    if (r.success) successCount++;
    console.log(`${status} ${r.name.padEnd(18)} ${String(r.count).padStart(4)} results  (${r.elapsed}ms)`);
  }
  console.log(`\n${successCount}/${results.length} sources working`);
}

main().catch(console.error);
