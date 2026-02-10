import type { SearchResult, Tweet, TwitterSearchResponse } from '../types.js';

const TWITTER_API_BASE = 'https://api.twitterapi.io';

async function makeTwitterRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const apiKey = process.env.TWITTER_API_KEY;
  
  if (!apiKey) {
    console.warn('Twitter API key not configured');
    return { tweets: [] };
  }

  const url = new URL(`${TWITTER_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Twitter API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function searchTwitter(query: string, cursor?: string): Promise<SearchResult[]> {
  try {
    const params: Record<string, string> = {
      query: query,
      queryType: 'Latest'
    };

    if (cursor) {
      params.cursor = cursor;
    }

    const data: TwitterSearchResponse = await makeTwitterRequest(
      '/twitter/tweet/advanced_search',
      params
    );

    if (!data.tweets || !Array.isArray(data.tweets)) {
      return [];
    }

    return data.tweets.map((tweet: Tweet) => ({
      title: tweet.text.slice(0, 100),
      content: tweet.text,
      url: tweet.url,
      source: 'twitter' as const,
      sourceId: tweet.id,
      publishedAt: new Date(tweet.createdAt),
      viewCount: tweet.viewCount,
      likeCount: tweet.likeCount,
      retweetCount: tweet.retweetCount,
      author: {
        name: tweet.author.name,
        username: tweet.author.userName,
        avatar: tweet.author.profilePicture,
        followers: tweet.author.followers,
        verified: tweet.author.isBlueVerified
      }
    }));
  } catch (error) {
    console.error('Twitter search error:', error);
    return [];
  }
}

export async function getTrends(woeid: number = 1): Promise<any[]> {
  try {
    const data = await makeTwitterRequest('/twitter/trends', { woeid: String(woeid) });
    return data.trends || [];
  } catch (error) {
    console.error('Error fetching trends:', error);
    return [];
  }
}

export async function getUserTweets(username: string): Promise<SearchResult[]> {
  try {
    const data = await makeTwitterRequest('/twitter/user/last_tweets', {
      userName: username
    });

    if (!data.tweets || !Array.isArray(data.tweets)) {
      return [];
    }

    return data.tweets.map((tweet: Tweet) => ({
      title: tweet.text.slice(0, 100),
      content: tweet.text,
      url: tweet.url,
      source: 'twitter' as const,
      sourceId: tweet.id,
      publishedAt: new Date(tweet.createdAt),
      viewCount: tweet.viewCount,
      likeCount: tweet.likeCount,
      retweetCount: tweet.retweetCount,
      author: {
        name: tweet.author.name,
        username: tweet.author.userName,
        avatar: tweet.author.profilePicture,
        followers: tweet.author.followers,
        verified: tweet.author.isBlueVerified
      }
    }));
  } catch (error) {
    console.error('Error fetching user tweets:', error);
    return [];
  }
}
