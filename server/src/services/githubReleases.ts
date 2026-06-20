/**
 * GitHub Releases Monitor — Track latest releases from key AI projects.
 * Uses GitHub REST API (free, no auth, 60 req/hr).
 */
import axios from 'axios';
import type { SearchResult } from '../types.js';

// Key AI repos to monitor for new releases
const AI_REPOS = [
  // Code agents
  { owner: 'openai',      repo: 'codex',                    label: 'OpenAI Codex',           priority: 1 },
  { owner: 'anthropics',  repo: 'claude-code',              label: 'Claude Code',            priority: 1 }, // community SDK
  { owner: 'anthropics',  repo: 'claude-code-action',       label: 'Claude Code Action',    priority: 2 },
  // AI SDKs & frameworks
  { owner: 'openai',      repo: 'openai-node',               label: 'OpenAI Node SDK',       priority: 2 },
  { owner: 'openai',      repo: 'openai-python',             label: 'OpenAI Python SDK',     priority: 2 },
  { owner: 'anthropics',  repo: 'anthropic-sdk-typescript',  label: 'Anthropic TS SDK',       priority: 2 },
  // AI tools
  { owner: 'continuedev', repo: 'continue',                  label: 'Continue (AI IDE)',     priority: 3 },
  { owner: 'aider-ai',    repo: 'aider',                     label: 'Aider AI',              priority: 3 },
  // Agent frameworks
  { owner: 'langchain-ai',repo: 'langchainjs',              label: 'LangChain JS',           priority: 3 },
  { owner: 'microsoft',   repo: 'autogen',                   label: 'AutoGen (Microsoft)',   priority: 3 },
  { owner: 'crewAIInc',   repo: 'crewAI',                    label: 'CrewAI',                 priority: 3 },
];

const GITHUB_API = 'https://api.github.com';
const RELEASE_INTERVAL_MS = 3000; // 3s between requests (60 req/hr limit = 1/min safe)

let lastRequestTime = 0;
async function waitRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RELEASE_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, RELEASE_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  author: {
    login: string;
    avatar_url: string;
  };
}

/**
 * Fetch latest release from a single GitHub repo.
 */
async function fetchRepoReleases(
  owner: string,
  repo: string,
  label: string
): Promise<SearchResult[]> {
  await waitRateLimit();

  try {
    const response = await axios.get<GitHubRelease[]>(
      `${GITHUB_API}/repos/${owner}/${repo}/releases`,
      {
        params: { per_page: 3 },
        timeout: 15000,
        headers: {
          'User-Agent': 'HotPulse/1.0',
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    const releases = response.data;
    if (!Array.isArray(releases) || releases.length === 0) return [];

    const results: SearchResult[] = releases.map(release => ({
      title: `${label}: ${release.name || release.tag_name}`,
      content: (release.body || '').slice(0, 500).replace(/[\r\n]+/g, ' ').trim() || release.tag_name,
      url: release.html_url,
      source: 'github' as any,
      sourceId: `${owner}/${repo}#${release.tag_name}`,
      publishedAt: new Date(release.published_at),
      author: {
        name: release.author?.login || owner,
        avatar: release.author?.avatar_url,
      },
    }));

    return results;
  } catch (error: any) {
    // 404 = repo not found or no releases, 403 = rate limited
    if (error.response?.status !== 404) {
      console.error(`  GitHub Releases [${owner}/${repo}] error:`, error.response?.status || error.message);
    }
    return [];
  }
}

/**
 * Fetch latest releases from all tracked AI repos.
 * Returns SearchResult[] with source='github'.
 */
export async function searchGitHubReleases(): Promise<SearchResult[]> {
  console.log('📦 Fetching GitHub Releases...');
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  const sorted = [...AI_REPOS].sort((a, b) => a.priority - b.priority);

  for (const repo of sorted) {
    const results = await fetchRepoReleases(repo.owner, repo.repo, repo.label);
    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allResults.push(r);
      }
    }
  }

  console.log(`📦 GitHub Releases: ${allResults.length} releases from ${sorted.length} repos`);
  return allResults;
}
