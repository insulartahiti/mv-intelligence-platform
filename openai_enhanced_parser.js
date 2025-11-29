require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

class OpenAIEnhancedParser {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.processedCount = 0;
    this.errorCount = 0;
  }

  // --- Sanitization helpers -------------------------------------------------
  stripCodeFences(text) {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }

  toJsonArrayOrList(text) {
    if (Array.isArray(text)) return text;
    if (!text) return [];
    const cleaned = this.stripCodeFences(text);
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return Object.values(parsed);
    } catch (_) {
      // Fallback: split lines or commas
      if (cleaned.includes('\n')) {
        return cleaned
          .split('\n')
          .map(s => s.replace(/^[-*\s]+/, '').trim())
          .filter(Boolean);
      }
      if (cleaned.includes(',')) {
        return cleaned
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      }
    }
    return cleaned ? [cleaned] : [];
  }

  toShortTags(list) {
    return (list || [])
      .map(s => (typeof s === 'string' ? s : String(s)))
      .map(s => this.stripCodeFences(s))
      .map(s => s.toLowerCase().replace(/[^a-z0-9\-\s]/g, '').replace(/\s+/g, '-'))
      .filter(Boolean)
      .slice(0, 12);
  }

  /**
   * Generate AI summary using OpenAI
   */
  async generateAISummary(parsedData, entityName) {
    if (!this.openaiApiKey) {
      console.log('OpenAI API key not found, using fallback');
      return this.generateFallbackSummary(parsedData, entityName);
    }

    try {
      const prompt = this.buildSummaryPrompt(parsedData, entityName);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert business analyst who creates concise, informative summaries of companies based on web search data. Focus on key business insights, recent developments, and company characteristics.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 300,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('OpenAI summary generation failed:', error.message);
      return this.generateFallbackSummary(parsedData, entityName);
    }
  }

  /**
   * Generate AI insights using OpenAI
   */
  async generateAIInsights(parsedData, entityName) {
    if (!this.openaiApiKey) {
      return this.generateFallbackInsights(parsedData, entityName);
    }

    try {
      const prompt = this.buildInsightsPrompt(parsedData, entityName);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a business intelligence analyst. Extract key insights about companies from web search data. Return insights as a JSON array of strings, focusing on industry, stage, technology, recent developments, and business characteristics.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 200,
          temperature: 0.2
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const contentRaw = data.choices[0].message.content?.trim() || '';
      const content = this.stripCodeFences(contentRaw);
      // Try to parse as JSON, fallback to list parsing
      try {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : Object.values(parsed || {});
      } catch {
        return this.toJsonArrayOrList(content);
      }
    } catch (error) {
      console.error('OpenAI insights generation failed:', error.message);
      return this.generateFallbackInsights(parsedData, entityName);
    }
  }

  /**
   * Generate AI tags using OpenAI
   */
  async generateAITags(parsedData, entityName) {
    if (!this.openaiApiKey) {
      return this.generateFallbackTags(parsedData, entityName);
    }

    try {
      const prompt = this.buildTagsPrompt(parsedData, entityName);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a data analyst who creates relevant tags for companies. Return tags as a JSON array of strings, focusing on industry, technology, stage, and key characteristics. Use lowercase, hyphenated format (e.g., "fintech", "early-stage", "ai-powered").'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 100,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const contentRaw = data.choices[0].message.content?.trim() || '';
      const content = this.stripCodeFences(contentRaw);
      try {
        const parsed = JSON.parse(content);
        return this.toShortTags(Array.isArray(parsed) ? parsed : Object.values(parsed || {}));
      } catch {
        return this.toShortTags(content);
      }
    } catch (error) {
      console.error('OpenAI tags generation failed:', error.message);
      return this.generateFallbackTags(parsedData, entityName);
    }
  }

  /**
   * Enhanced extraction using OpenAI
   */
  async extractStructuredData(webSearchData) {
    if (!this.openaiApiKey) {
      return this.extractStructuredDataFallback(webSearchData);
    }

    try {
      const prompt = this.buildExtractionPrompt(webSearchData);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a data extraction specialist. Analyze web search results and extract structured information about companies. Return a JSON object with the following structure: {industry, stage, location, technologies, recentNews, keyInsights, companyInfo}.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 500,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content.trim();
      
      try {
        return JSON.parse(content);
      } catch {
        return this.extractStructuredDataFallback(webSearchData);
      }
    } catch (error) {
      console.error('OpenAI extraction failed:', error.message);
      return this.extractStructuredDataFallback(webSearchData);
    }
  }

  /**
   * Build summary prompt
   */
  buildSummaryPrompt(parsedData, entityName) {
    const results = parsedData.results || [];
    const companyInfo = parsedData.companyInfo || {};
    const recentNews = parsedData.recentNews || [];
    
    let prompt = `Create a concise, informative summary for "${entityName}" based on the following web search data:\n\n`;
    
    if (companyInfo.industry) {
      prompt += `Industry: ${companyInfo.industry}\n`;
    }
    if (companyInfo.stage) {
      prompt += `Stage: ${companyInfo.stage}\n`;
    }
    if (companyInfo.location) {
      prompt += `Location: ${companyInfo.location}\n`;
    }
    
    if (recentNews.length > 0) {
      prompt += `\nRecent News:\n`;
      recentNews.slice(0, 3).forEach((news, index) => {
        prompt += `${index + 1}. ${news.title}\n`;
      });
    }
    
    prompt += `\nSearch Results:\n`;
    results.slice(0, 5).forEach((result, index) => {
      prompt += `${index + 1}. ${result.title}\n   ${result.snippet.substring(0, 200)}...\n\n`;
    });
    
    prompt += `\nCreate a 2-3 sentence summary that highlights the company's business focus, recent developments, and key characteristics.`;
    
    return prompt;
  }

  /**
   * Build insights prompt
   */
  buildInsightsPrompt(parsedData, entityName) {
    const results = parsedData.results || [];
    const companyInfo = parsedData.companyInfo || {};
    
    let prompt = `Extract key business insights for "${entityName}" from this data:\n\n`;
    
    if (companyInfo.industry) {
      prompt += `Industry: ${companyInfo.industry}\n`;
    }
    if (companyInfo.stage) {
      prompt += `Stage: ${companyInfo.stage}\n`;
    }
    
    prompt += `\nSearch Results:\n`;
    results.slice(0, 3).forEach((result, index) => {
      prompt += `${index + 1}. ${result.title}\n   ${result.snippet.substring(0, 150)}...\n\n`;
    });
    
    prompt += `\nReturn 3-5 key insights as a JSON array of strings.`;
    
    return prompt;
  }

  /**
   * Build tags prompt
   */
  buildTagsPrompt(parsedData, entityName) {
    const companyInfo = parsedData.companyInfo || {};
    const results = parsedData.results || [];
    
    let prompt = `Create relevant tags for "${entityName}" based on:\n\n`;
    
    if (companyInfo.industry) {
      prompt += `Industry: ${companyInfo.industry}\n`;
    }
    if (companyInfo.technologies) {
      prompt += `Technologies: ${companyInfo.technologies.join(', ')}\n`;
    }
    
    prompt += `\nSearch Results:\n`;
    results.slice(0, 2).forEach((result, index) => {
      prompt += `${index + 1}. ${result.title}\n   ${result.snippet.substring(0, 100)}...\n\n`;
    });
    
    prompt += `\nReturn 5-8 relevant tags as a JSON array of strings.`;
    
    return prompt;
  }

  /**
   * Build extraction prompt
   */
  buildExtractionPrompt(webSearchData) {
    const parsed = typeof webSearchData === 'string' ? JSON.parse(webSearchData) : webSearchData;
    const results = parsed.results || [];
    
    let prompt = `Extract structured information from these web search results:\n\n`;
    
    results.forEach((result, index) => {
      prompt += `${index + 1}. ${result.title}\n   ${result.snippet.substring(0, 300)}...\n\n`;
    });
    
    prompt += `\nExtract and return a JSON object with: industry, stage, location, technologies (array), recentNews (array of titles), keyInsights (array), and companyInfo (object with additional details).`;
    
    return prompt;
  }

  // Fallback methods (existing custom logic)
  generateFallbackSummary(parsedData, entityName) {
    // Use existing custom logic
    const insights = parsedData.keyInsights || [];
    const recentNews = parsedData.recentNews || [];
    const companyInfo = parsedData.companyInfo || {};
    
    let summary = `${entityName} is `;
    
    if (companyInfo.industry) {
      summary += `a ${companyInfo.industry} company`;
    } else {
      summary += `a company`;
    }
    
    if (companyInfo.stage) {
      summary += ` in the ${companyInfo.stage} stage`;
    }
    
    if (companyInfo.location) {
      summary += ` based in ${companyInfo.location}`;
    }
    
    if (recentNews.length > 0) {
      summary += `. Recent developments include ${recentNews.length} news updates in 2024-2025`;
    }
    
    if (insights.length > 0) {
      summary += `. Key insights: ${insights.slice(0, 3).join(', ')}`;
    }
    
    return summary;
  }

  generateFallbackInsights(parsedData, entityName) {
    const insights = [];
    const companyInfo = parsedData.companyInfo || {};
    const recentNews = parsedData.recentNews || [];
    
    if (companyInfo.industry) {
      insights.push(`Industry: ${companyInfo.industry}`);
    }
    if (companyInfo.stage) {
      insights.push(`Development Stage: ${companyInfo.stage}`);
    }
    if (companyInfo.technologies && companyInfo.technologies.length > 0) {
      insights.push(`Technology Stack: ${companyInfo.technologies.join(', ')}`);
    }
    if (recentNews.length > 0) {
      insights.push(`Recent Activity: ${recentNews.length} news updates in 2024-2025`);
    }
    
    return insights;
  }

  generateFallbackTags(parsedData, entityName) {
    const tags = [];
    const companyInfo = parsedData.companyInfo || {};
    
    if (companyInfo.industry) {
      tags.push(companyInfo.industry.toLowerCase());
    }
    if (companyInfo.stage) {
      tags.push(companyInfo.stage.toLowerCase().replace(' ', '-'));
    }
    if (companyInfo.technologies) {
      tags.push(...companyInfo.technologies.map(t => t.toLowerCase()));
    }
    
    return tags;
  }

  extractStructuredDataFallback(webSearchData) {
    // Use existing custom parsing logic
    // This would be the current implementation
    return null;
  }
}

module.exports = OpenAIEnhancedParser;
