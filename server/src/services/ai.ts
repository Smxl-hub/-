import { OpenRouter } from '@openrouter/sdk';
import type { AIAnalysis } from '../types.js';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? ''
});

const ANALYSIS_PROMPT = `你是一个专业的热点分析专家。请分析以下内容，判断其是否为真实有价值的热点信息。

分析要点：
1. 判断是否为真实的热点新闻（排除标题党、假新闻、营销软文）
2. 评估该内容与 AI 编程/技术领域的相关性（0-100分）
3. 评估热点的重要程度
4. 生成简短摘要（50字以内）

请以 JSON 格式输出，格式如下：
{
  "isReal": true/false,
  "relevance": 0-100,
  "importance": "low/medium/high/urgent",
  "summary": "简短摘要..."
}

只输出 JSON，不要有其他内容。`;

export async function analyzeContent(content: string): Promise<AIAnalysis> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('OpenRouter API key not configured, using fallback analysis');
    return {
      isReal: true,
      relevance: 50,
      importance: 'low',
      summary: content.slice(0, 50) + '...'
    };
  }

  try {
    const result = await openRouter.chat.send({
      model: 'deepseek/deepseek-v3.2',
      messages: [
        {
          role: 'system',
          content: ANALYSIS_PROMPT
        },
        {
          role: 'user',
          content: content.slice(0, 2000) // 限制内容长度
        }
      ],
      temperature: 0.3,
      maxTokens: 500
    });

    const rawContent = result.choices[0]?.message?.content || '';
    const responseContent = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    
    // 尝试解析 JSON
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isReal: Boolean(parsed.isReal),
        relevance: Math.min(100, Math.max(0, Number(parsed.relevance) || 0)),
        importance: ['low', 'medium', 'high', 'urgent'].includes(parsed.importance) 
          ? parsed.importance 
          : 'low',
        summary: String(parsed.summary || '').slice(0, 100)
      };
    }

    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('AI analysis failed:', error);
    // Fallback
    return {
      isReal: true,
      relevance: 30,
      importance: 'low',
      summary: content.slice(0, 50) + '...'
    };
  }
}

export async function batchAnalyze(contents: string[]): Promise<AIAnalysis[]> {
  // 并行分析，但限制并发数
  const batchSize = 3;
  const results: AIAnalysis[] = [];

  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(content => analyzeContent(content))
    );
    results.push(...batchResults);
  }

  return results;
}
