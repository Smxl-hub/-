import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { searchTwitter } from '../services/twitter.js';
import { searchBing, searchGoogle, searchDuckDuckGo, searchHackerNews, deduplicateResults } from '../services/search.js';
import { fetchAllFeeds } from '../services/rssFeeds.js';
import { searchArXiv } from '../services/arxiv.js';
import { searchReddit } from '../services/reddit.js';
import { searchDevTo } from '../services/devto.js';
import { searchProductHunt } from '../services/producthunt.js';
import { searchGitHubTrending } from '../services/githubTrending.js';
import { searchGitHubReleases } from '../services/githubReleases.js';
import { searchNitter } from '../services/nitter.js';
import { analyzeContent, expandKeyword, preMatchKeyword } from '../services/ai.js';
import { sendHotspotEmail } from '../services/email.js';
import { sendHotspotAlert } from '../services/telegram.js';
import type { SearchResult } from '../types.js';

// Freshness filter: discard content older than 7 days
const MAX_AGE_HOURS = 7 * 24;

function filterByFreshness(results: SearchResult[]): SearchResult[] {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
  return results.filter(item => {
    // Keep items without publish date (search engine results often don't have one)
    if (!item.publishedAt) return true;
    return item.publishedAt >= cutoff;
  });
}

// Priority ordering: real-time/social sources first, general search last
function prioritizeResults(results: SearchResult[]): SearchResult[] {
  const priorityMap: Record<string, number> = {
    nitter: 1,       // Twitter via Nitter RSS — fastest primary source
    twitter: 2,      // Twitter API (if key configured)
    github: 3,       // GitHub Releases + Trending
    hackernews: 4,
    reddit: 5,
    rss: 6,
    arxiv: 7,
    devto: 8,
    producthunt: 9,
    bing: 10,
    google: 11,
    duckduckgo: 12
  };
  return [...results].sort((a, b) => {
    return (priorityMap[a.source] || 99) - (priorityMap[b.source] || 99);
  });
}

export async function runHotspotCheck(io: Server): Promise<void> {
  console.log('🔍 Starting hotspot check...');

  // Fetch all active keywords
  const keywords = await prisma.keyword.findMany({
    where: { isActive: true }
  });

  if (keywords.length === 0) {
    console.log('No active keywords to monitor');
    return;
  }

  console.log(`Checking ${keywords.length} keywords...`);

  let newHotspotsCount = 0;

  for (const keyword of keywords) {
    console.log(`\n📎 Checking keyword: "${keyword.text}"`);

    try {
      // Step 1: Query Expansion via AI
      console.log(`  🔍 Expanding keyword "${keyword.text}"...`);
      const expandedKeywords = await expandKeyword(keyword.text);
      console.log(`  📋 Expanded to ${expandedKeywords.length} variants: ${expandedKeywords.slice(0, 5).join(', ')}${expandedKeywords.length > 5 ? '...' : ''}`);

      // Step 2: Fetch from all sources in parallel (14 sources)
      const [
        nitterResults,
        twitterResults,
        githubReleaseResults,
        githubTrendingResults,
        bingResults,
        googleResults,
        duckduckgoResults,
        hackernewsResults,
        rssResults,
        arxivResults,
        redditResults,
        devtoResults,
        producthuntResults
      ] = await Promise.allSettled([
        searchNitter(),
        searchTwitter(keyword.text),
        searchGitHubReleases(),
        searchGitHubTrending(keyword.text),
        searchBing(keyword.text),
        searchGoogle(keyword.text),
        searchDuckDuckGo(keyword.text),
        searchHackerNews(keyword.text),
        fetchAllFeeds(),
        searchArXiv(keyword.text),
        searchReddit(keyword.text),
        searchDevTo(keyword.text),
        searchProductHunt()
      ]);

      const allResults: SearchResult[] = [];

      const sources = [
        { name: 'Nitter (Twitter RSS)', result: nitterResults },
        { name: 'Twitter API', result: twitterResults },
        { name: 'GitHub Releases', result: githubReleaseResults },
        { name: 'GitHub Trending', result: githubTrendingResults },
        { name: 'Bing', result: bingResults },
        { name: 'Google', result: googleResults },
        { name: 'DuckDuckGo', result: duckduckgoResults },
        { name: 'HackerNews', result: hackernewsResults },
        { name: 'RSS Feeds', result: rssResults },
        { name: 'ArXiv', result: arxivResults },
        { name: 'Reddit', result: redditResults },
        { name: 'DEV.to', result: devtoResults },
        { name: 'ProductHunt', result: producthuntResults }
      ];

      for (const source of sources) {
        if (source.result.status === 'fulfilled') {
          allResults.push(...source.result.value);
          console.log(`  ${source.name}: ${source.result.value.length} results`);
        } else {
          console.log(`  ${source.name}: failed — ${source.result.reason}`);
        }
      }

      // Deduplicate → freshness filter → sort by priority
      const uniqueResults = deduplicateResults(allResults);
      const freshResults = filterByFreshness(uniqueResults);
      const sortedResults = prioritizeResults(freshResults);
      console.log(`  Total: ${allResults.length} raw → ${uniqueResults.length} unique → ${freshResults.length} fresh (within ${MAX_AGE_HOURS}h)`);

      // Process results: Twitter gets priority quota
      // Twitter up to 15, other sources share 10
      let twitterProcessed = 0;
      let otherProcessed = 0;
      const TWITTER_QUOTA = 15;
      const OTHER_QUOTA = 10;

      for (const item of sortedResults) {
        // Check quotas
        if (item.source === 'twitter' && twitterProcessed >= TWITTER_QUOTA) continue;
        if (item.source !== 'twitter' && otherProcessed >= OTHER_QUOTA) continue;
        if (twitterProcessed + otherProcessed >= TWITTER_QUOTA + OTHER_QUOTA) break;

        try {
          // Check if already exists (dedup by URL + source)
          const existing = await prisma.hotspot.findFirst({
            where: {
              url: item.url,
              source: item.source
            }
          });

          if (existing) continue;

          // AI analysis (keyword-aware, with pre-match)
          const fullText = item.title + '\n' + item.content;
          const preMatch = preMatchKeyword(fullText, expandedKeywords);
          const analysis = await analyzeContent(fullText, keyword.text, preMatch);

          // Filter: only keep real and relevant content
          if (!analysis.isReal) {
            console.log(`  ❌ Filtered fake/spam: ${item.title.slice(0, 30)}...`);
            continue;
          }

          // Relevance threshold: below 50 is noise
          if (analysis.relevance < 50) {
            console.log(`  ⏭ Low relevance (${analysis.relevance}): ${item.title.slice(0, 30)}...`);
            continue;
          }

          // Extra rule: keyword not mentioned AND relevance < 65 → drop
          if (!analysis.keywordMentioned && analysis.relevance < 65) {
            console.log(`  ⏭ Keyword not mentioned & relevance < 65 (${analysis.relevance}): ${item.title.slice(0, 30)}...`);
            continue;
          }

          // Save hotspot
          const hotspot = await prisma.hotspot.create({
            data: {
              title: item.title,
              content: item.content,
              url: item.url,
              source: item.source,
              sourceId: item.sourceId || null,
              isReal: analysis.isReal,
              relevance: analysis.relevance,
              relevanceReason: analysis.relevanceReason || null,
              keywordMentioned: analysis.keywordMentioned ?? null,
              importance: analysis.importance,
              summary: analysis.summary,
              viewCount: item.viewCount || null,
              likeCount: item.likeCount || null,
              retweetCount: item.retweetCount || null,
              replyCount: item.replyCount || null,
              commentCount: item.commentCount || null,
              quoteCount: item.quoteCount || null,
              danmakuCount: item.danmakuCount || null,
              authorName: item.author?.name || null,
              authorUsername: item.author?.username || null,
              authorAvatar: item.author?.avatar || null,
              authorFollowers: item.author?.followers || null,
              authorVerified: item.author?.verified ?? null,
              publishedAt: item.publishedAt || null,
              keywordId: keyword.id
            },
            include: { keyword: true }
          });

          newHotspotsCount++;
          if (item.source === 'twitter') twitterProcessed++;
          else otherProcessed++;
          console.log(`  ✅ New hotspot [${item.source}]: ${hotspot.title.slice(0, 40)}... (${analysis.importance})`);

          // Create notification
          await prisma.notification.create({
            data: {
              type: 'hotspot',
              title: `New hotspot: ${hotspot.title.slice(0, 50)}`,
              content: analysis.summary || hotspot.content.slice(0, 100),
              hotspotId: hotspot.id
            }
          });

          // WebSocket push — per-keyword room + global
          io.to(`keyword:${keyword.text}`).emit('hotspot:new', hotspot);
          io.emit('notification', {
            type: 'hotspot',
            title: 'New Hotspot Discovered',
            content: hotspot.title,
            hotspotId: hotspot.id,
            importance: hotspot.importance
          });

          // Email + Telegram notification for high/urgent items
          if (['high', 'urgent'].includes(analysis.importance)) {
            await sendHotspotEmail(hotspot);
            await sendHotspotAlert(hotspot as any);
          }

        } catch (error) {
          console.error(`  Error processing result:`, error);
        }
      }

      // Throttle between keywords
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`Error checking keyword "${keyword.text}":`, error);
    }
  }

  console.log(`\n✨ Hotspot check completed. Found ${newHotspotsCount} new hotspots.`);
}
