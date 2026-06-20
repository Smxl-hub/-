import { Router } from 'express';
import { prisma } from '../db.js';
import { sortHotspots } from '../utils/sortHotspots.js';

const router = Router();

// Get all hotspots (with filters, pagination, sorting)
router.get('/', async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      source,
      importance,
      keywordId,
      isReal,
      timeRange,
      timeFrom,
      timeTo,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (source) where.source = source;
    if (importance) where.importance = importance;
    if (keywordId) where.keywordId = keywordId;
    if (isReal !== undefined && isReal !== '') {
      where.isReal = isReal === 'true';
    }

    // Time range filter
    if (timeRange) {
      const now = new Date();
      let dateFrom: Date | null = null;
      switch (timeRange) {
        case '1h':
          dateFrom = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'today':
          dateFrom = new Date(now);
          dateFrom.setHours(0, 0, 0, 0);
          break;
        case '7d':
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }
      if (dateFrom) {
        where.createdAt = { gte: dateFrom };
      }
    } else if (timeFrom || timeTo) {
      where.createdAt = {};
      if (timeFrom) where.createdAt.gte = new Date(timeFrom as string);
      if (timeTo) where.createdAt.lte = new Date(timeTo as string);
    }

    // Sorting
    let orderBy: any;
    const sort = sortBy as string;
    const order = (sortOrder as string) === 'asc' ? 'asc' : 'desc';

    // importance and hot need in-memory sorting (Prisma can't sort custom fields)
    const needsMemorySort = sort === 'importance' || sort === 'hot';

    switch (sort) {
      case 'publishedAt':
        orderBy = [{ publishedAt: order }, { createdAt: 'desc' }];
        break;
      case 'relevance':
        orderBy = { relevance: order };
        break;
      case 'importance':
      case 'hot':
        orderBy = { createdAt: 'desc' };
        break;
      default:
        orderBy = { createdAt: order };
        break;
    }

    const [rawHotspots, total] = await Promise.all([
      prisma.hotspot.findMany({
        where,
        orderBy,
        ...(needsMemorySort ? {} : { skip, take: limitNum }),
        include: {
          keyword: {
            select: { id: true, text: true, category: true }
          }
        }
      }),
      prisma.hotspot.count({ where })
    ]);

    let hotspots;
    if (needsMemorySort) {
      const sorted = sortHotspots(rawHotspots, sort, order as 'asc' | 'desc');
      hotspots = sorted.slice(skip, skip + limitNum);
    } else {
      hotspots = rawHotspots;
    }

    res.json({
      data: hotspots,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching hotspots:', error);
    res.status(500).json({ error: 'Failed to fetch hotspots' });
  }
});

// Get hotspot statistics
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalHotspots,
      todayHotspots,
      urgentHotspots,
      sourceStats
    ] = await Promise.all([
      prisma.hotspot.count(),
      prisma.hotspot.count({
        where: { createdAt: { gte: today } }
      }),
      prisma.hotspot.count({
        where: { importance: 'urgent' }
      }),
      prisma.hotspot.groupBy({
        by: ['source'],
        _count: { source: true }
      })
    ]);

    res.json({
      total: totalHotspots,
      today: todayHotspots,
      urgent: urgentHotspots,
      bySource: sourceStats.reduce((acc: Record<string, number>, item: { source: string; _count: { source: number } }) => {
        acc[item.source] = item._count.source;
        return acc;
      }, {} as Record<string, number>)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get single hotspot
router.get('/:id', async (req, res) => {
  try {
    const hotspot = await prisma.hotspot.findUnique({
      where: { id: req.params.id },
      include: { keyword: true }
    });

    if (!hotspot) {
      return res.status(404).json({ error: 'Hotspot not found' });
    }

    res.json(hotspot);
  } catch (error) {
    console.error('Error fetching hotspot:', error);
    res.status(500).json({ error: 'Failed to fetch hotspot' });
  }
});

// Manual search across all sources
router.post('/search', async (req, res) => {
  try {
    const {
      query,
      sources = ['twitter', 'bing', 'google', 'duckduckgo', 'hackernews', 'rss', 'arxiv', 'reddit', 'devto', 'producthunt', 'github']
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Dynamic imports for search services
    const { searchTwitter } = await import('../services/twitter.js');
    const { searchBing, searchGoogle, searchDuckDuckGo, searchHackerNews } = await import('../services/search.js');
    const { fetchAllFeeds } = await import('../services/rssFeeds.js');
    const { searchArXiv } = await import('../services/arxiv.js');
    const { searchReddit } = await import('../services/reddit.js');
    const { searchDevTo } = await import('../services/devto.js');
    const { searchProductHunt } = await import('../services/producthunt.js');
    const { searchGitHubTrending } = await import('../services/githubTrending.js');
    const { analyzeContent, preMatchKeyword, expandKeyword } = await import('../services/ai.js');

    const results: any[] = [];

    // Execute searches based on requested sources
    const searchMap: Record<string, () => Promise<any[]>> = {
      twitter: () => searchTwitter(query),
      bing: () => searchBing(query),
      google: () => searchGoogle(query),
      duckduckgo: () => searchDuckDuckGo(query),
      hackernews: () => searchHackerNews(query),
      rss: () => fetchAllFeeds(),
      arxiv: () => searchArXiv(query),
      reddit: () => searchReddit(query),
      devto: () => searchDevTo(query),
      producthunt: () => searchProductHunt(),
      github: () => searchGitHubTrending(query),
    };

    for (const source of sources) {
      const searchFn = searchMap[source];
      if (!searchFn) continue;
      try {
        const sourceResults = await searchFn();
        results.push(...sourceResults);
      } catch (error) {
        console.error(`${source} search failed:`, error);
      }
    }

    // AI analysis for top 10 results (with preMatch for better accuracy)
    const expandedKw = await expandKeyword(query);
    const analyzedResults = await Promise.all(
      results.slice(0, 10).map(async (item) => {
        try {
          const fullText = item.title + ' ' + item.content;
          const preMatch = preMatchKeyword(fullText, expandedKw);
          const analysis = await analyzeContent(fullText, query, preMatch);
          return { ...item, analysis };
        } catch {
          return { ...item, analysis: null };
        }
      })
    );

    res.json({ results: analyzedResults });
  } catch (error) {
    console.error('Error searching hotspots:', error);
    res.status(500).json({ error: 'Failed to search hotspots' });
  }
});

// Delete hotspot
router.delete('/:id', async (req, res) => {
  try {
    await prisma.hotspot.delete({
      where: { id: req.params.id }
    });

    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Hotspot not found' });
    }
    console.error('Error deleting hotspot:', error);
    res.status(500).json({ error: 'Failed to delete hotspot' });
  }
});

export default router;
