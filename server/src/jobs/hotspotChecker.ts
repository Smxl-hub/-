import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { searchTwitter } from '../services/twitter.js';
import { searchBing } from '../services/search.js';
import { analyzeContent } from '../services/ai.js';
import { sendHotspotEmail } from '../services/email.js';
import type { SearchResult } from '../types.js';

export async function runHotspotCheck(io: Server): Promise<void> {
  console.log('🔍 Starting hotspot check...');

  // 获取所有激活的关键词
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
      // 从多个来源获取数据
      const [twitterResults, bingResults] = await Promise.allSettled([
        searchTwitter(keyword.text),
        searchBing(keyword.text)
      ]);

      const allResults: SearchResult[] = [];

      if (twitterResults.status === 'fulfilled') {
        allResults.push(...twitterResults.value);
        console.log(`  Twitter: ${twitterResults.value.length} results`);
      } else {
        console.log(`  Twitter: failed - ${twitterResults.reason}`);
      }

      if (bingResults.status === 'fulfilled') {
        allResults.push(...bingResults.value);
        console.log(`  Bing: ${bingResults.value.length} results`);
      } else {
        console.log(`  Bing: failed - ${bingResults.reason}`);
      }

      // 处理每个结果
      for (const item of allResults.slice(0, 10)) {
        try {
          // 检查是否已存在
          const existing = await prisma.hotspot.findFirst({
            where: {
              url: item.url,
              source: item.source
            }
          });

          if (existing) {
            continue;
          }

          // AI 分析
          const analysis = await analyzeContent(item.title + '\n' + item.content);

          // 只保存真实且相关的热点
          if (!analysis.isReal) {
            console.log(`  ❌ Filtered fake/spam: ${item.title.slice(0, 30)}...`);
            continue;
          }

          if (analysis.relevance < 40) {
            console.log(`  ⏭ Low relevance (${analysis.relevance}): ${item.title.slice(0, 30)}...`);
            continue;
          }

          // 保存热点
          const hotspot = await prisma.hotspot.create({
            data: {
              title: item.title,
              content: item.content,
              url: item.url,
              source: item.source,
              sourceId: item.sourceId || null,
              isReal: analysis.isReal,
              relevance: analysis.relevance,
              importance: analysis.importance,
              summary: analysis.summary,
              viewCount: item.viewCount || null,
              likeCount: item.likeCount || null,
              retweetCount: item.retweetCount || null,
              publishedAt: item.publishedAt || null,
              keywordId: keyword.id
            },
            include: {
              keyword: true
            }
          });

          newHotspotsCount++;
          console.log(`  ✅ New hotspot: ${hotspot.title.slice(0, 40)}... (${analysis.importance})`);

          // 创建通知
          await prisma.notification.create({
            data: {
              type: 'hotspot',
              title: `发现新热点: ${hotspot.title.slice(0, 50)}`,
              content: analysis.summary || hotspot.content.slice(0, 100),
              hotspotId: hotspot.id
            }
          });

          // WebSocket 通知
          io.to(`keyword:${keyword.text}`).emit('hotspot:new', hotspot);
          io.emit('notification', {
            type: 'hotspot',
            title: '发现新热点',
            content: hotspot.title,
            hotspotId: hotspot.id,
            importance: hotspot.importance
          });

          // 邮件通知（仅对高重要级别）
          if (['high', 'urgent'].includes(analysis.importance)) {
            await sendHotspotEmail(hotspot);
          }

        } catch (error) {
          console.error(`  Error processing result:`, error);
        }
      }

      // 避免过快请求
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`Error checking keyword "${keyword.text}":`, error);
    }
  }

  console.log(`\n✨ Hotspot check completed. Found ${newHotspotsCount} new hotspots.`);
}
