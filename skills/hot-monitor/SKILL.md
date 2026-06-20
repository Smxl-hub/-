---
name: latest-intel-station
description: >
  AI hotspot monitoring and trending topic discovery across 16+ international sources (Twitter/X, HackerNews,
  ArXiv, Reddit, DEV.to, ProductHunt, GitHub Trending, RSS feeds from OpenAI/DeepMind/TechCrunch/VentureBeat,
  plus Bing/Google/DuckDuckGo). Use when users ask about: trending AI news, hot topics, latest developments,
  monitoring keywords, tech/AI news discovery, generating hotspot reports, "最近有什么热点", "帮我关注XX动态",
  "查一下XX最新消息", "生成热点报告", "monitor XX", "what's trending in XX", or any request to search/track/discover
  current events and trending content across international platforms.
---

# 最新情报站 — AI 热点监控技能

Search and analyze trending topics across 16+ international sources without any server or database. Scripts handle data collection; use your own AI capabilities for analysis.

## Quick Start

All scripts are in `scripts/`. Install dependencies first:

```bash
pip install requests beautifulsoup4 feedparser
```

Set optional env vars (all sources work without keys):
```bash
export TWITTER_API_KEY=your_key        # optional, for Twitter/X search
export PRODUCTHUNT_TOKEN=your_token    # optional, for ProductHunt GraphQL
```

## Core Workflow

### 1. Understand User Intent

Determine what the user needs:
- **Broad discovery**: "最近AI有什么热点" → search multiple sources with broad keywords
- **Specific tracking**: "帮我关注GPT-5动态" → targeted search with specific keyword
- **Report generation**: "生成今日热点报告" → full pipeline + formatted output

### 2. Execute Search

Run search scripts based on scope. All sources are international (English-first), no Chinese sources.

**Web search** (no API keys needed):
```bash
python scripts/search_web.py "AI programming" --sources bing,google,duckduckgo,hackernews
```

**AI ecosystem sources** (no API keys needed):
```bash
python scripts/search_ai.py "large language models" --sources arxiv,reddit,devto,producthunt,github,rss
```

**Twitter/X** (requires `TWITTER_API_KEY`):
```bash
python scripts/search_twitter.py "AI programming"
```

All scripts output JSON to stdout. Combine results for multi-source analysis.

### 3. Analyze Results

After collecting search results, apply the analysis framework yourself (no external AI API needed). For each result, evaluate:

1. **Authenticity** (`isReal`): Is this genuine news or clickbait/rumor?
2. **Relevance** (0-100): How related is this to the user's interest area?
3. **Importance** (low/medium/high/urgent): How significant is this development?
4. **Summary**: One-sentence summary of the core information in context of the keyword

See [references/analysis-guide.md](references/analysis-guide.md) for detailed evaluation criteria.

### 4. Present Results

Format output as structured report, sorted by importance. Use this template:

```markdown
## 🔥 Hotspot Monitor Report — {keyword}
> Scan time: {timestamp} | Sources: {sources_used}

### 🚨 Urgent
- **{title}** — {summary}
  Source: {source} | Relevance: {relevance}% | [Link]({url})

### 🔴 High
...

### 🟡 Medium
...

### 🟢 Low
...

---
Found {total} hotspots: {urgent} urgent, {high} high
```

## Data Sources (16+ International)

| Category | Sources | API Key Needed |
|----------|---------|----------------|
| **Real-time Social** | Twitter/X, Reddit (5 AI subs) | Twitter only |
| **Tech Community** | HackerNews, DEV.to | None |
| **AI Research** | ArXiv (cs.AI/LG/CL/CV/NE) | None |
| **AI Blogs (RSS)** | OpenAI, DeepMind, TechCrunch AI, VentureBeat AI, The Verge AI, Ars Technica, MarkTechPost, MIT Tech Review | None |
| **Product Discovery** | ProductHunt, GitHub Trending | PH token optional |
| **Web Search** | Bing, Google, DuckDuckGo | None |

## Script Reference

| Script | Sources | API Key | Output |
|--------|---------|---------|--------|
| `search_web.py` | Bing, Google, DuckDuckGo, HackerNews | None | JSON array of `{title, content, url, source, publishedAt?}` |
| `search_ai.py` | ArXiv, Reddit, DEV.to, ProductHunt, GitHub Trending, RSS Feeds | None | JSON array (same schema + engagement metrics) |
| `search_twitter.py` | Twitter/X | `TWITTER_API_KEY` | JSON array (same schema + author info) |
| `generate_report.py` | — | None | Reads JSON from stdin, outputs Markdown report |

### Common Options

All search scripts support:
- `--sources`: Comma-separated list of sources to use (default: all)
- `--limit`: Max results per source (default: 20)
- `--json`: Output raw JSON (default, always JSON to stdout)

### Error Handling

Scripts output `[]` (empty JSON array) on failure and print errors to stderr. Always check for empty results and inform the user which sources failed.

## Advanced Patterns

### Keyword Expansion

For better coverage, expand the user's keyword into variants before searching:
- English/Chinese translations (e.g., "人工智能" ↔ "AI" ↔ "Artificial Intelligence")
- Abbreviations (e.g., "GPT-5" → also search "GPT5", "OpenAI GPT")
- Related terms (e.g., "Claude" → also search "Anthropic", "Claude 4")

### Multi-keyword Batch

For monitoring multiple keywords, run searches sequentially with a 3-second delay between keywords to respect rate limits.

## Reference Files

- [references/search-sources.md](references/search-sources.md) — Detailed info about each data source, rate limits, and quirks
- [references/analysis-guide.md](references/analysis-guide.md) — Hotspot analysis framework: authenticity, relevance, importance criteria
