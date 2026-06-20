#!/usr/bin/env python3
"""
Search AI ecosystem sources: ArXiv, Reddit, DEV.to, ProductHunt, GitHub Trending, RSS Feeds.
All sources are free — no API keys required.

Usage:
  python search_ai.py "large language models"
  python search_ai.py "GPT-5" --sources arxiv,reddit,github
  python search_ai.py --sources rss  (fetch all RSS feeds, no query)
"""

import argparse
import json
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Optional

import requests
from bs4 import BeautifulSoup

# ============================================================
# Data model
# ============================================================

@dataclass
class Result:
    title: str
    content: str
    url: str
    source: str
    sourceId: Optional[str] = None
    publishedAt: Optional[str] = None
    score: Optional[int] = None
    viewCount: Optional[int] = None
    likeCount: Optional[int] = None
    commentCount: Optional[int] = None
    authorName: Optional[str] = None

# ============================================================
# Rate limiter
# ============================================================

class RateLimiter:
    def __init__(self, interval: float = 2.0):
        self.interval = interval
        self.last_request = 0.0

    def wait(self):
        elapsed = time.time() - self.last_request
        if elapsed < self.interval:
            time.sleep(self.interval - elapsed)
        self.last_request = time.time()

# ============================================================
# User Agents
# ============================================================

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
]

def random_ua():
    import random
    return random.choice(USER_AGENTS)

# ============================================================
# ArXiv
# ============================================================

arxiv_limiter = RateLimiter(3.0)

AI_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'cs.NE']

def search_arxiv(query: str = None) -> list[dict]:
    arxiv_limiter.wait()
    results = []

    try:
        cat_query = '+OR+'.join(f'cat:{c}' for c in AI_CATEGORIES)
        if query:
            encoded = urllib.parse.quote(query)
            search_query = f'({cat_query})+AND+(abs:{encoded}+OR+ti:{encoded})'
        else:
            search_query = cat_query

        url = f'http://export.arxiv.org/api/query?search_query={search_query}&sortBy=submittedDate&sortOrder=descending&max_results=20'
        resp = requests.get(url, timeout=30,
            headers={'User-Agent': 'HotPulse/1.0 (mailto:dev@example.com)'})
        resp.raise_for_status()

        # Parse Atom XML
        root = ET.fromstring(resp.text)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}

        for entry in root.findall('atom:entry', ns):
            title_el = entry.find('atom:title', ns)
            summary_el = entry.find('atom:summary', ns)
            id_el = entry.find('atom:id', ns)
            published_el = entry.find('atom:published', ns)

            if title_el is None or id_el is None:
                continue

            title = title_el.text.strip().replace('\n', ' ') if title_el.text else ''
            summary = summary_el.text.strip()[:500] if summary_el is not None and summary_el.text else ''
            authors = [a.find('atom:name', ns).text for a in entry.findall('atom:author', ns) if a.find('atom:name', ns) is not None]

            results.append({
                'title': title,
                'content': summary or title,
                'url': id_el.text.strip(),
                'source': 'arxiv',
                'sourceId': id_el.text.split('/abs/')[-1] if '/abs/' in (id_el.text or '') else id_el.text,
                'publishedAt': published_el.text.strip() if published_el is not None and published_el.text else None,
                'authorName': ', '.join(authors) if authors else None,
            })

        print(f'ArXiv: {len(results)} papers', file=sys.stderr)
    except Exception as e:
        print(f'ArXiv error: {e}', file=sys.stderr)

    return results

# ============================================================
# Reddit
# ============================================================

reddit_limiter = RateLimiter(2.0)

AI_SUBREDDITS = ['MachineLearning', 'artificial', 'LocalLLaMA', 'OpenAI', 'singularity']

def _fetch_reddit_posts(items: list) -> list[dict]:
    results = []
    for child in items:
        data = child.get('data', {})
        if data.get('stickied') or data.get('over_18'):
            continue

        title = data.get('title', '')
        if not title:
            continue

        selftext = data.get('selftext', '') or ''
        if selftext in ('[removed]', '[deleted]'):
            selftext = ''

        url = data.get('url', '')
        permalink = data.get('permalink', '')
        if url.startswith('https://www.reddit.com') or url.startswith('/r/'):
            url = f'https://www.reddit.com{permalink}'

        results.append({
            'title': title,
            'content': selftext[:500] or title,
            'url': url,
            'source': 'reddit',
            'sourceId': data.get('id'),
            'publishedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(data.get('created_utc', 0))) if data.get('created_utc') else None,
            'score': data.get('score'),
            'viewCount': data.get('ups'),
            'commentCount': data.get('num_comments'),
            'authorName': data.get('author'),
        })
    return results

def search_reddit(query: str = None) -> list[dict]:
    reddit_limiter.wait()
    results = []

    if query:
        try:
            url = f'https://www.reddit.com/search.json?q={urllib.parse.quote(query)}&sort=new&t=week&limit=25&raw_json=1'
            resp = requests.get(url, timeout=15, headers={'User-Agent': random_ua()})
            resp.raise_for_status()
            children = resp.json().get('data', {}).get('children', [])
            results = _fetch_reddit_posts(children)
            print(f'Reddit search: {len(results)} results', file=sys.stderr)
        except Exception as e:
            print(f'Reddit search error: {e}', file=sys.stderr)
    else:
        for sub in AI_SUBREDDITS:
            try:
                url = f'https://www.reddit.com/r/{sub}/hot.json?limit=25&raw_json=1'
                resp = requests.get(url, timeout=15, headers={'User-Agent': random_ua()})
                resp.raise_for_status()
                children = resp.json().get('data', {}).get('children', [])
                sub_results = _fetch_reddit_posts(children)
                results.extend(sub_results)
                print(f'Reddit r/{sub}: {len(sub_results)} posts', file=sys.stderr)
            except Exception as e:
                print(f'Reddit r/{sub} error: {e}', file=sys.stderr)

    return results

# ============================================================
# DEV.to
# ============================================================

devto_limiter = RateLimiter(1.0)

def search_devto(query: str = None) -> list[dict]:
    devto_limiter.wait()
    results = []

    try:
        url = 'https://dev.to/api/articles?tag=ai&per_page=20'
        if not query:
            url += '&top=7'
        resp = requests.get(url, timeout=15, headers={'User-Agent': 'HotPulse/1.0'})
        resp.raise_for_status()
        articles = resp.json()

        if query:
            q = query.lower()
            articles = [a for a in articles if
                q in (a.get('title', '') + a.get('description', '')).lower()
                or any(q in t.lower() for t in a.get('tag_list', []))
            ]

        for a in articles:
            results.append({
                'title': a.get('title', ''),
                'content': (a.get('description') or a.get('title', ''))[:500],
                'url': a.get('url', ''),
                'source': 'devto',
                'sourceId': str(a.get('id', '')),
                'publishedAt': a.get('published_at'),
                'commentCount': a.get('comments_count'),
                'likeCount': a.get('positive_reactions_count'),
                'authorName': a.get('user', {}).get('name'),
            })

        print(f'DEV.to: {len(results)} articles', file=sys.stderr)
    except Exception as e:
        print(f'DEV.to error: {e}', file=sys.stderr)

    return results

# ============================================================
# ProductHunt (RSS)
# ============================================================

ph_limiter = RateLimiter(60.0)

AI_TERMS = ['ai', 'artificial intelligence', 'machine learning', 'llm', 'gpt',
    'chatgpt', 'openai', 'claude', 'anthropic', 'gemini', 'deepseek',
    'copilot', 'agent', 'rag', 'vector', 'embedding', 'fine-tuning',
    'neural', 'transformer', 'diffusion', 'langchain', 'llama', 'mistral']

def _is_ai_related(title: str, desc: str) -> bool:
    text = (title + ' ' + desc).lower()
    return any(t in text for t in AI_TERMS)

def search_producthunt() -> list[dict]:
    ph_limiter.wait()
    results = []

    try:
        import feedparser
        feed = feedparser.parse('https://www.producthunt.com/feed')

        for entry in feed.entries:
            title = entry.get('title', '')
            desc = entry.get('summary', '') or entry.get('description', '')

            if not _is_ai_related(title, desc):
                continue

            results.append({
                'title': title.split(' - ')[0].strip() if ' - ' in title else title,
                'content': desc[:300],
                'url': entry.get('link', ''),
                'source': 'producthunt',
                'sourceId': entry.get('id'),
                'publishedAt': entry.get('published'),
                'authorName': entry.get('author'),
            })

        print(f'ProductHunt: {len(results)} AI products', file=sys.stderr)
    except ImportError:
        print('ProductHunt: feedparser not installed, skipping', file=sys.stderr)
    except Exception as e:
        print(f'ProductHunt error: {e}', file=sys.stderr)

    return results

# ============================================================
# GitHub Trending
# ============================================================

github_limiter = RateLimiter(10.0)

def _parse_stars(text: str) -> int:
    text = text.replace(',', '').strip()
    if text.lower().endswith('k'):
        return int(float(text[:-1]) * 1000)
    try:
        return int(text)
    except ValueError:
        return 0

def search_github_trending(query: str = None) -> list[dict]:
    github_limiter.wait()
    results = []

    # Scrape GitHub Trending
    try:
        resp = requests.get(
            'https://github.com/trending?since=weekly&spoken_language_code=en',
            timeout=15,
            headers={'User-Agent': random_ua(), 'Accept': 'text/html'}
        )
        resp.raise_for_status()

        if 'sign-in' in resp.text.lower():
            print('GitHub Trending: rate limited', file=sys.stderr)
        else:
            soup = BeautifulSoup(resp.text, 'html.parser')
            for article in soup.select('article.Box-row'):
                title_el = article.select_one('h2 a')
                if not title_el:
                    continue
                repo_path = ' '.join(title_el.get_text(strip=True).split())
                href = title_el.get('href', '')
                desc_el = article.select_one('p')
                desc = desc_el.get_text(strip=True) if desc_el else ''

                star_el = article.select_one('a[href*="stargazers"]')
                fork_el = article.select_one('a[href*="forks"]')
                stars = _parse_stars(star_el.get_text(strip=True)) if star_el else 0
                forks = _parse_stars(fork_el.get_text(strip=True)) if fork_el else 0
                owner = repo_path.split('/')[0] if '/' in repo_path else ''

                results.append({
                    'title': f'{repo_path}: {desc[:80]}' if desc else repo_path,
                    'content': desc or repo_path,
                    'url': f'https://github.com{href}',
                    'source': 'github',
                    'sourceId': repo_path,
                    'viewCount': stars,
                    'authorName': owner,
                })

            print(f'GitHub Trending: {len(results)} repos', file=sys.stderr)
    except Exception as e:
        print(f'GitHub Trending error: {e}', file=sys.stderr)

    # If query provided, also search via API
    if query:
        try:
            encoded = urllib.parse.quote(f'{query} ai OR machine-learning')
            resp = requests.get(
                f'https://api.github.com/search/repositories?q={encoded}&sort=stars&order=desc&per_page=20',
                timeout=15,
                headers={'User-Agent': 'HotPulse/1.0', 'Accept': 'application/vnd.github.v3+json'}
            )
            resp.raise_for_status()
            for repo in resp.json().get('items', []):
                results.append({
                    'title': f'{repo["full_name"]}: {(repo.get("description") or "")[:100]}',
                    'content': repo.get('description', ''),
                    'url': repo['html_url'],
                    'source': 'github',
                    'sourceId': repo['full_name'],
                    'viewCount': repo.get('stargazers_count'),
                    'authorName': repo.get('owner', {}).get('login'),
                })
            print(f'GitHub API: {len(resp.json().get("items", []))} repos', file=sys.stderr)
        except Exception as e:
            print(f'GitHub API error: {e}', file=sys.stderr)

    return results

# ============================================================
# RSS Feeds
# ============================================================

FEEDS = [
    ('OpenAI Blog', 'https://openai.com/news/rss.xml'),
    ('DeepMind', 'https://deepmind.google/blog/rss.xml'),
    ('Google AI Blog', 'https://blog.google/technology/ai/rss/'),
    ('TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/'),
    ('VentureBeat AI', 'https://venturebeat.com/category/ai/feed/'),
    ('The Verge AI', 'https://www.theverge.com/ai-artificial-intelligence/rss.xml'),
    ('Ars Technica', 'https://arstechnica.com/ai/feed/'),
    ('MarkTechPost', 'https://www.marktechpost.com/feed/'),
    ('MIT Tech Review', 'https://www.technologyreview.com/feed/'),
]

def fetch_all_feeds() -> list[dict]:
    results = []
    seen_urls = set()

    try:
        import feedparser
    except ImportError:
        print('RSS: feedparser not installed, skipping', file=sys.stderr)
        return results

    for name, url in FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries:
                title = entry.get('title', '')
                link = entry.get('link', '')
                if not title or not link:
                    continue
                if link in seen_urls:
                    continue
                seen_urls.add(link)

                content = entry.get('summary', '') or entry.get('description', '')
                results.append({
                    'title': title,
                    'content': content[:500] or title,
                    'url': link,
                    'source': 'rss',
                    'sourceId': entry.get('id', link),
                    'publishedAt': entry.get('published'),
                    'authorName': entry.get('author'),
                })
            print(f'RSS [{name}]: {len(feed.entries)} items', file=sys.stderr)
        except Exception as e:
            print(f'RSS [{name}] error: {e}', file=sys.stderr)

        time.sleep(5)  # Polite delay between feeds

    print(f'RSS total: {len(results)} unique items', file=sys.stderr)
    return results

# ============================================================
# Main
# ============================================================

SOURCE_MAP = {
    'arxiv': search_arxiv,
    'reddit': search_reddit,
    'devto': search_devto,
    'producthunt': search_producthunt,
    'github': search_github_trending,
    'rss': fetch_all_feeds,
}

def main():
    parser = argparse.ArgumentParser(description='Search AI ecosystem sources')
    parser.add_argument('query', nargs='?', help='Search query')
    parser.add_argument('--sources', default='all', help='Comma-separated source list (arxiv,reddit,devto,producthunt,github,rss)')
    parser.add_argument('--json', action='store_true', default=True, help='Output JSON')
    args = parser.parse_args()

    sources = [s.strip() for s in args.sources.split(',')] if args.sources != 'all' else list(SOURCE_MAP.keys())
    sources = [s for s in sources if s in SOURCE_MAP]

    all_results = []
    for source_name in sources:
        try:
            fn = SOURCE_MAP[source_name]
            if source_name in ('producthunt', 'rss'):
                source_results = fn()  # No query needed
            else:
                source_results = fn(args.query)
            all_results.extend(source_results)
        except Exception as e:
            print(f'{source_name} error: {e}', file=sys.stderr)

    # Deduplicate by URL
    seen = set()
    unique = []
    for r in all_results:
        url = r['url'].rstrip('/').replace('http://www.', 'https://').replace('https://www.', 'https://')
        if url not in seen:
            seen.add(url)
            unique.append(r)

    json.dump(unique, sys.stdout, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
