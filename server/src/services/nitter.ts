/**
 * Nitter RSS — Free Twitter monitoring via public Nitter instances.
 * No API key, no Google account, no auth of any kind.
 *
 * Nitter is an open-source Twitter frontend that provides RSS feeds.
 * Multiple instances are used for failover.
 */
import Parser from 'rss-parser';
import type { SearchResult } from '../types.js';

// Public Nitter instances (tried in order, failover on error)
const NITTER_INSTANCES = [
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
  'https://nitter.net',
  'https://nitter.woodland.cafe',
  'https://nitter.lanterne-rouge.info',
];

// Key AI accounts to track — primary sources for AI news
const AI_ACCOUNTS = [
  // Claude / Anthropic
  { username: 'AnthropicAI',    label: 'Anthropic Official',     priority: 1 },
  { username: 'alexalbert__',   label: 'Alex Albert (Claude)',   priority: 1 }, // Claude Code tech lead
  { username: 'annanthropic',   label: 'Anthropic DevRel',       priority: 2 },
  // OpenAI / Codex
  { username: 'OpenAI',         label: 'OpenAI Official',        priority: 1 },
  { username: 'sama',           label: 'Sam Altman (OpenAI)',   priority: 2 },
  { username: 'gdb',            label: 'Greg Brockman (OpenAI)', priority: 2 },
  // Google DeepMind / Gemini
  { username: 'GoogleDeepMind', label: 'Google DeepMind',         priority: 1 },
  { username: 'GoogleAI',       label: 'Google AI',               priority: 2 },
  { username: 'JeffDean',       label: 'Jeff Dean (Google)',      priority: 2 },
  // Cursor / Anysphere
  { username: 'cursor_ai',      label: 'Cursor AI',               priority: 1 },
  // AI research leaders
  { username: 'AndrewYNg',      label: 'Andrew Ng',               priority: 3 },
  { username: 'ylecun',         label: 'Yann LeCun (Meta AI)',   priority: 3 },
  { username: '_akhaliq',       label: 'AK (AI Papers)',          priority: 3 }, // Posts every new AI paper
];

const RSS_INTERVAL_MS = 3000; // 3s between Nitter requests (be polite)

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

async function tryFetchRss(url: string): Promise<Parser.Output<{ [key: string]: any }> | null> {
  const parser = new Parser({
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HotPulse/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  try {
    return await parser.parseURL(url);
  } catch {
    return null;
  }
}

/**
 * Fetch tweets from a single account via Nitter RSS.
 * Tries multiple Nitter instances for failover.
 */
async function fetchAccountTweets(
  username: string,
  label: string,
  triedInstances: Set<string>
): Promise<SearchResult[]> {
  // Shuffle instances for load distribution
  const shuffled = [...NITTER_INSTANCES].sort(() => Math.random() - 0.5);

  for (const instance of shuffled) {
    if (triedInstances.has(instance)) continue;

    const feedUrl = `${instance}/${username}/rss`;
    const feed = await tryFetchRss(feedUrl);

    if (!feed || !feed.items) continue;

    // This instance works — mark it as working
    triedInstances.add(instance);

    const results: SearchResult[] = [];

    for (const item of feed.items.slice(0, 10)) {
      if (!item.title || !item.link) continue;

      // Nitter RSS title format: "username: tweet text"
      let title = item.title;
      const prefixMatch = title.match(/^@?\w+:\s*/);
      if (prefixMatch) {
        title = title.slice(prefixMatch[0].length);
      }
      title = decodeEntities(title).trim();
      if (!title) continue;

      // Truncate very long tweets
      const content = item.contentSnippet
        ? decodeEntities(stripHtml(item.contentSnippet)).slice(0, 300)
        : title;

      results.push({
        title,
        content,
        url: item.link!,
        source: 'nitter' as any, // will be typed as 'nitter' after types update
        sourceId: item.guid || item.link || undefined,
        publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
        author: {
          name: label,
          username: username,
        },
      });
    }

    console.log(`  Nitter [@${username}] via ${instance}: ${results.length} tweets`);
    return results;
  }

  return []; // All instances failed
}

/**
 * Fetch latest tweets from all tracked AI accounts.
 * Returns SearchResult[] with source='nitter'.
 */
export async function searchNitter(): Promise<SearchResult[]> {
  console.log('🐦 Fetching Nitter (Twitter RSS)...');
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();
  const triedInstances = new Set<string>();

  // Sort by priority
  const sorted = [...AI_ACCOUNTS].sort((a, b) => a.priority - b.priority);

  for (const account of sorted) {
    const results = await fetchAccountTweets(
      account.username,
      account.label,
      triedInstances
    );

    for (const r of results) {
      const normalized = r.url.replace(/\/$/, '').toLowerCase();
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        allResults.push(r);
      }
    }

    // Rate limit between accounts
    await new Promise(resolve => setTimeout(resolve, RSS_INTERVAL_MS));
  }

  console.log(`🐦 Nitter total: ${allResults.length} tweets from ${sorted.length} accounts`);
  return allResults;
}
