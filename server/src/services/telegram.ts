import axios from 'axios';
import type { HotspotWithKeyword } from '../types.js';

const TELEGRAM_API = 'https://api.telegram.org';

function getBotToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function getChatId(): string {
  return (process.env.TELEGRAM_CHAT_ID || '').trim();
}

function isConfigured(): boolean {
  return Boolean(getBotToken() && getChatId());
}

/**
 * Send a plain text or HTML message to Telegram.
 */
async function sendMessage(text: string, options?: {
  parseMode?: 'HTML' | 'MarkdownV2';
  disableNotification?: boolean;
}): Promise<boolean> {
  if (!isConfigured()) {
    console.warn('Telegram: bot token or chat ID not configured, skipping');
    return false;
  }

  const token = getBotToken();
  const chatId = getChatId();

  try {
    await axios.post(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || 'HTML',
      disable_web_page_preview: false,
      disable_notification: options?.disableNotification || false,
    }, { timeout: 10000 });

    return true;
  } catch (error) {
    console.error('Telegram send error:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Send a hotspot alert to Telegram with rich formatting.
 */
export async function sendHotspotAlert(hotspot: HotspotWithKeyword): Promise<boolean> {
  if (!isConfigured()) return false;

  const importanceEmoji: Record<string, string> = {
    low: '📌',
    medium: '⚡',
    high: '🔥',
    urgent: '🚨'
  };

  const sourceEmoji: Record<string, string> = {
    twitter: '🐦',
    hackernews: '🔶',
    reddit: '🤖',
    rss: '📰',
    arxiv: '📄',
    devto: '💻',
    producthunt: '🦄',
    github: '🐙',
    bing: '🔍',
    google: '🌐',
    duckduckgo: '🦆',
  };

  const emoji = importanceEmoji[hotspot.importance] || '📌';
  const sourceIcon = sourceEmoji[hotspot.source] || '📡';

  const message = [
    `${emoji} <b>${escapeHtml(hotspot.title)}</b>`,
    '',
    hotspot.summary ? `📝 ${escapeHtml(hotspot.summary)}` : '',
    '',
    `${sourceIcon} Source: <code>${escapeHtml(hotspot.source)}</code>`,
    `📊 Relevance: <b>${hotspot.relevance}/100</b>`,
    hotspot.keyword?.text ? `🔑 Keyword: <code>${escapeHtml(hotspot.keyword.text)}</code>` : '',
    '',
    `<a href="${escapeHtml(hotspot.url)}">🔗 View Original →</a>`,
  ].filter(Boolean).join('\n');

  const sent = await sendMessage(message, { parseMode: 'HTML' });

  if (sent) {
    console.log(`Telegram alert sent: ${hotspot.id}`);
  }

  return sent;
}

/**
 * Send a summary digest of hotspots to Telegram.
 */
export async function sendDigest(hotspots: HotspotWithKeyword[], keyword?: string): Promise<boolean> {
  if (!isConfigured() || hotspots.length === 0) return false;

  const header = keyword
    ? `📊 <b>Hotspot Digest — "${escapeHtml(keyword)}"</b>\n${hotspots.length} new hotspots found:\n`
    : `📊 <b>Hotspot Digest</b>\n${hotspots.length} new hotspots found:\n`;

  const items = hotspots.slice(0, 10).map((h, i) =>
    `${i + 1}. <a href="${escapeHtml(h.url)}">${escapeHtml(h.title.slice(0, 80))}</a> (${h.importance})`
  ).join('\n');

  const message = header + '\n' + items;
  return sendMessage(message, { parseMode: 'HTML' });
}

/**
 * Send a test message to verify Telegram configuration.
 */
export async function sendTestMessage(): Promise<boolean> {
  return sendMessage(
    '✅ <b>HotPulse 最新情报站 is online!</b>\n\nHotspot monitoring service is running and connected.\n16+ international sources active.',
    { parseMode: 'HTML' }
  );
}

/**
 * Escape HTML special characters for Telegram's HTML parse mode.
 * Telegram supports: <b>, <i>, <u>, <s>, <code>, <pre>, <a href>
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
