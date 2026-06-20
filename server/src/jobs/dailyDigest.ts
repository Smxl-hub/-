import { prisma } from '../db.js';
import { sendHotspotAlert } from '../services/telegram.js';
import { sendDigestEmail } from '../services/email.js';
import type { HotspotWithKeyword } from '../types.js';

/**
 * Gather hotspots from the past 24 hours and send a digest.
 * Called by cron at configured time (e.g. 9am daily).
 */
export async function runDailyDigest(): Promise<void> {
  console.log('📊 Running daily digest...');

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // Fetch all hotspots from the last 24h, sorted by importance
    const hotspots = await prisma.hotspot.findMany({
      where: {
        createdAt: { gte: yesterday }
      },
      orderBy: [
        { createdAt: 'desc' }
      ],
      include: {
        keyword: {
          select: { id: true, text: true, category: true }
        }
      },
      take: 50
    });

    if (hotspots.length === 0) {
      console.log('📊 Daily digest: no hotspots in the last 24h');
      return;
    }

    const urgentCount = hotspots.filter(h => h.importance === 'urgent').length;
    const highCount = hotspots.filter(h => h.importance === 'high').length;
    const mediumCount = hotspots.filter(h => h.importance === 'medium').length;

    // Build digest message
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const lines = [
      `📊 <b>HotPulse Daily Digest — ${dateStr}</b>`,
      '',
      `🔍 <b>${hotspots.length}</b> hotspots discovered in the last 24h:`,
      `  🚨 Urgent: <b>${urgentCount}</b>`,
      `  🔥 High: <b>${highCount}</b>`,
      `  ⚡ Medium: <b>${mediumCount}</b>`,
      '',
      '━━━━━━━━━━━━━━━━━━━',
      '',
    ];

    // Group by keyword
    const byKeyword: Record<string, HotspotWithKeyword[]> = {};
    for (const h of hotspots) {
      const kw = (h as any).keyword?.text || 'general';
      if (!byKeyword[kw]) byKeyword[kw] = [];
      byKeyword[kw].push(h as unknown as HotspotWithKeyword);
    }

    for (const [kw, items] of Object.entries(byKeyword)) {
      lines.push(`🔑 <b>${kw}</b> (${items.length} items)`);
      for (const item of items.slice(0, 5)) {
        const emoji = { urgent: '🚨', high: '🔥', medium: '⚡', low: '📌' }[item.importance] || '📌';
        const title = item.title.length > 60 ? item.title.slice(0, 60) + '...' : item.title;
        lines.push(`  ${emoji} <a href="${item.url}">${title}</a>`);
      }
      lines.push('');
    }

    // Send Telegram digest
    const { sendDigest: sendTelegramDigest } = await import('../services/telegram.js');
    await sendTelegramDigest(
      hotspots.map(h => h as unknown as HotspotWithKeyword)
    );

    // Send Email digest
    await sendDigestEmail(
      hotspots.map(h => ({
        id: h.id,
        title: h.title,
        content: h.content,
        url: h.url,
        source: h.source,
        importance: h.importance,
        relevance: h.relevance,
        summary: h.summary,
        createdAt: h.createdAt
      }))
    );

    console.log(`📊 Daily digest sent: ${hotspots.length} hotspots (${urgentCount} urgent, ${highCount} high)`);
  } catch (error) {
    console.error('Daily digest error:', error);
  }
}
