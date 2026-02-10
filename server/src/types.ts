export interface SearchResult {
  title: string;
  content: string;
  url: string;
  source: 'twitter' | 'bing' | 'google';
  sourceId?: string;
  publishedAt?: Date;
  viewCount?: number;
  likeCount?: number;
  retweetCount?: number;
  author?: {
    name: string;
    username?: string;
    avatar?: string;
    followers?: number;
    verified?: boolean;
  };
}

export interface AIAnalysis {
  isReal: boolean;
  relevance: number;
  importance: 'low' | 'medium' | 'high' | 'urgent';
  summary: string;
}

export interface HotspotWithKeyword {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  sourceId: string | null;
  isReal: boolean;
  relevance: number;
  importance: string;
  summary: string | null;
  viewCount: number | null;
  likeCount: number | null;
  retweetCount: number | null;
  publishedAt: Date | null;
  createdAt: Date;
  keywordId: string | null;
  keyword: {
    id: string;
    text: string;
    category: string | null;
  } | null;
}

export interface Tweet {
  type: string;
  id: string;
  url: string;
  text: string;
  retweetCount: number;
  replyCount: number;
  likeCount: number;
  quoteCount: number;
  viewCount: number;
  createdAt: string;
  lang: string;
  author: {
    userName: string;
    name: string;
    isBlueVerified: boolean;
    profilePicture: string;
    followers: number;
  };
}

export interface TwitterSearchResponse {
  tweets: Tweet[];
  has_next_page: boolean;
  next_cursor: string;
}
