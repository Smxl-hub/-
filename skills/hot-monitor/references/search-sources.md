# Search Sources Reference

Detailed information about each data source, including endpoints, rate limits, parsing strategies, and known quirks.

## Social & Community Sources

### Twitter/X
- **Method**: REST API via `twitterapi.io` (requires API key)
- **Base URL**: `https://api.twitterapi.io`
- **Auth**: Header `X-API-Key: {key}`
- **Search endpoint**: `GET /twitter/tweet/advanced_search?query={query}&queryType={Top|Latest}`
- **Quality filter thresholds**: likes ≥ 10, retweets ≥ 5, views ≥ 500, followers ≥ 100 (halved for blue-verified users)
- See server implementation at `server/src/services/twitter.ts`

### Reddit
- **Method**: Public JSON API (no API key)
- **Hot posts**: `https://www.reddit.com/r/{subreddit}/hot.json?limit=25&raw_json=1`
- **Search**: `https://www.reddit.com/search.json?q={query}&sort=new&t=week&limit=25&raw_json=1`
- **AI Subreddits**: r/MachineLearning, r/artificial, r/LocalLLaMA, r/OpenAI, r/singularity
- **Rate limit**: 2 seconds between requests (Reddit allows ~60/min)
- **Required**: Real browser User-Agent header (requests without it fail)
- **Quirks**: `selftext` may be `[removed]` or `[deleted]`. Link posts have empty `selftext`. `url` field may be Reddit permalink or external link.

### Hacker News (Algolia API)
- **Method**: Official JSON API (no API key)
- **URL**: `https://hn.algolia.com/api/v1/search?query={query}&tags=story&hitsPerPage=20`
- **Rate limit**: 1 second (very permissive)
- **Filter**: `numericFilters=created_at_i>{unix_timestamp}` for time-based filtering
- **Quirks**: Best source for tech/programming news. `url` may be null for "Ask HN" posts.

## AI Research

### ArXiv
- **Method**: Official API (no API key required by convention)
- **URL**: `http://export.arxiv.org/api/query?search_query={query}&sortBy=submittedDate&sortOrder=descending&max_results=20`
- **Rate limit**: 3 seconds between requests (enforced by convention)
- **AI Categories**: cs.AI, cs.LG, cs.CL, cs.CV, cs.NE
- **Format**: Atom XML — parse `<entry>` blocks
- **Quirks**: XML entities need decoding. Titles have extra whitespace. Use `abs:` for abstract search, `ti:` for title search.

### DEV.to
- **Method**: Public REST API (no API key)
- **Articles**: `https://dev.to/api/articles?tag=ai&per_page=20`
- **Top articles**: Add `&top=7` for weekly top
- **Rate limit**: Very generous (~30 req/min unauthenticated, 3000/hr with free key)
- **Quirks**: `description` may be null. `positive_reactions_count` includes likes/unicorns/bookmarks, not pure likes. Future-dated posts are scheduled.

## AI Blog RSS Feeds

All feeds are free, no API keys needed. Use `rss-parser` (Node.js) or `feedparser` (Python).

| Feed | URL | Category |
|------|-----|----------|
| OpenAI Blog | `https://openai.com/news/rss.xml` | AI |
| Google DeepMind | `https://deepmind.google/blog/rss.xml` | AI |
| Google AI Blog | `https://blog.google/technology/ai/rss/` | AI |
| TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` | AI |
| VentureBeat AI | `https://venturebeat.com/category/ai/feed/` | AI |
| The Verge AI | `https://www.theverge.com/ai-artificial-intelligence/rss.xml` | AI |
| Ars Technica AI | `https://arstechnica.com/ai/feed/` | Tech |
| MarkTechPost | `https://www.marktechpost.com/feed/` | AI |
| MIT Tech Review | `https://www.technologyreview.com/feed/` | Tech |

- **Rate limit**: 5 seconds between feeds (total ~45s for all 9 feeds)
- **Quirks**: Feed URLs may change; single feed failure doesn't block others. Strip HTML from `content:encoded`. Decode HTML entities in titles.

## Product Discovery

### ProductHunt
- **Primary**: RSS feed at `https://www.producthunt.com/feed` (free, no auth)
- **Optional**: GraphQL API at `https://api.producthunt.com/v2/api/graphql` (requires `PRODUCTHUNT_TOKEN`)
- **Rate limit**: 60 seconds (RSS); 10 seconds (GraphQL)
- **AI filtering**: Client-side keyword matching on title/description for AI-related terms
- **Quirks**: RSS returns all products, not just AI. GraphQL `topic: "artificial-intelligence"` filter is more precise. PH naming convention: `"ProductName - Tagline"`.

### GitHub Trending
- **Primary**: Scrape `https://github.com/trending?since=weekly` (free, no auth)
- **Fallback**: Search API `https://api.github.com/search/repositories?q={query}&sort=stars&order=desc`
- **Rate limit**: 10 seconds between requests
- **Quirks**: Scraping may trigger login wall if rate-limited. Star counts may have `k` suffix ("12.5k" → 12500). API returns cleaner data but no "trending" signal.

## Web Search Engines

### Bing
- **Method**: HTML scraping (no API key)
- **URL**: `https://www.bing.com/search?q={query}&count=20`
- **Rate limit**: 5 seconds
- **Selector**: `li.b_algo` → title from `h2 a`, snippet from `.b_caption p`

### Google
- **Method**: HTML scraping (no API key)
- **URL**: `https://www.google.com/search?q={query}&num=20&hl=en`
- **Rate limit**: 10 seconds (stricter anti-bot)
- **Selector**: `div.g` → title from `h3`, snippet from `.VwiC3b`
- **Quirks**: Most aggressive anti-bot protection. May require proxy for frequent use.

### DuckDuckGo (HTML)
- **Method**: HTML version scraping (no API key)
- **URL**: `https://html.duckduckgo.com/html/?q={query}`
- **Rate limit**: 3 seconds
- **Selector**: `.result` → title from `.result__title a`, snippet from `.result__snippet`
- **Quirks**: Uses redirect URLs with `uddg=` parameter — extract actual URL. Most reliable for scraping.

## Rate Limiting Summary

| Source | Min Interval | Anti-Bot Risk | API Key |
|--------|-------------|---------------|---------|
| Twitter/X | N/A (paid API) | None | Required |
| HackerNews | 1s | None | None |
| DEV.to | 1s | None | None |
| Reddit | 2s | Low | None |
| ArXiv | 3s | None | None |
| DuckDuckGo | 3s | Low | None |
| Bing | 5s | Medium | None |
| RSS Feeds | 5s per feed | None | None |
| Google | 10s | High | None |
| GitHub | 10s | Medium | None |
| ProductHunt | 60s | None | Optional |

## User-Agent Rotation

Use these User-Agents randomly for web scraping sources:

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15
```

## URL Deduplication

Normalize URLs before deduplication:
1. Remove trailing `/`
2. Replace `http://www.` and `https://www.` with `https://`
3. Compare normalized URLs
