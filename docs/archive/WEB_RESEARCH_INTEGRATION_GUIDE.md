# 🌐 Web Research & News Integration Guide

## Overview

The MV Intelligence Platform now includes comprehensive web research and news search capabilities that significantly enhance the intelligence overlays with real-time market data, news mentions, social media sentiment, and competitive intelligence.

## 🚀 **New Capabilities Added**

### **1. News Search & Analysis**
- **Multi-Source News**: NewsAPI, Google News, Reddit, Twitter
- **Sentiment Analysis**: Positive, negative, neutral classification
- **Relevance Scoring**: AI-powered relevance to your entities
- **Entity Extraction**: Automatic identification of mentioned companies/people
- **Keyword Extraction**: Key terms and topics

### **2. Web Research**
- **Company Information**: Descriptions, websites, social media profiles
- **Key People**: Leadership team and decision makers
- **Funding History**: Recent rounds, investors, amounts
- **Acquisitions**: M&A activity and strategic moves
- **Competitive Landscape**: Direct competitors and market position

### **3. Market Intelligence**
- **Stock Prices**: Real-time pricing and market cap
- **Funding Trends**: Industry funding patterns and growth
- **Market Rankings**: Performance metrics and industry position
- **Market Signals**: Acquisitions, partnerships, announcements

### **4. Social Media Monitoring**
- **Multi-Platform**: Twitter, LinkedIn, Reddit, Facebook
- **Sentiment Tracking**: Public opinion and brand perception
- **Engagement Metrics**: Reach, engagement, influence
- **Trend Analysis**: Viral content and discussion topics

## 📊 **Database Schema**

### **New Tables Created:**
- `web_research` - Comprehensive research data
- `news_mentions` - News articles with sentiment analysis
- `market_signals` - Market data and financial signals
- `social_mentions` - Social media mentions and sentiment
- `competitive_intelligence` - Competitor analysis and SWOT
- `research_sources` - API configuration and rate limits

## 🔧 **API Endpoints**

### **1. News Search**
```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/news-search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "Motive Partners",
    "entity_type": "fund",
    "entity_id": "f5d8981d-3f7f-465b-896e-1e7f1673c9d9",
    "sources": ["newsapi", "google", "reddit", "twitter"],
    "limit": 20,
    "date_from": "2024-01-01",
    "date_to": "2024-12-31",
    "sentiment_filter": "positive"
  }'
```

### **2. Web Research**
```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/web-research" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "entity_type": "fund",
    "entity_id": "f5d8981d-3f7f-465b-896e-1e7f1673c9d9",
    "research_sources": ["news", "web", "social", "market"]
  }'
```

## 🔑 **Required API Keys**

### **News & Web Research:**
```bash
# NewsAPI (Free tier: 1000 requests/day)
NEWS_API_KEY=your_news_api_key

# Google Custom Search (Free tier: 100 requests/day)
GOOGLE_SEARCH_API_KEY=your_google_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id

# Alpha Vantage (Free tier: 5 requests/minute)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key

# Twitter API v2 (Free tier: 300 requests/15min)
TWITTER_BEARER_TOKEN=your_twitter_bearer_token
```

### **Setup Instructions:**

1. **NewsAPI Setup:**
   - Go to https://newsapi.org/
   - Sign up for free account
   - Get API key from dashboard
   - Add to Supabase environment variables

2. **Google Custom Search Setup:**
   - Go to https://developers.google.com/custom-search/v1/introduction
   - Create new project
   - Enable Custom Search API
   - Create custom search engine
   - Get API key and search engine ID

3. **Alpha Vantage Setup:**
   - Go to https://www.alphavantage.co/support/#api-key
   - Get free API key
   - Add to Supabase environment variables

4. **Twitter API Setup:**
   - Go to https://developer.twitter.com/
   - Apply for developer account
   - Create app and get bearer token
   - Add to Supabase environment variables

## 🎯 **Integration with Existing Intelligence**

### **Enhanced Intelligence Overlays:**
The web research data is automatically integrated with the existing intelligence system:

```typescript
// Example enhanced intelligence with web research
{
  "context": "Motive Partners is a private equity firm...",
  "opportunities": [
    "Recent $10M Series A funding indicates growth potential",
    "Positive news sentiment suggests market confidence",
    "LinkedIn network of 500+ connections provides warm intro opportunities"
  ],
  "risk_factors": [
    "Regulatory challenges mentioned in recent news",
    "Competitive landscape shows 3 direct competitors"
  ],
  "next_best_action": "Leverage positive news sentiment for initial outreach",
  "market_context": {
    "industry_trends": ["Fintech growth", "AI adoption", "Digital transformation"],
    "market_size": "$300B+ global fintech market",
    "growth_drivers": ["Consumer demand", "Technology investment", "Regulatory support"]
  },
  "news_mentions": [
    {
      "title": "Motive Partners Raises $10M in Series A",
      "sentiment": "positive",
      "relevance_score": 0.9,
      "source": "TechCrunch"
    }
  ]
}
```

## 📈 **RAG & Insights Enhancement**

### **What This Enables:**

1. **Real-Time Market Intelligence:**
   - Current news and market sentiment
   - Recent funding announcements
   - Competitive moves and acquisitions
   - Industry trends and developments

2. **Enhanced Relationship Intelligence:**
   - LinkedIn network analysis
   - Social media presence and influence
   - Recent activity and engagement
   - Warm introduction opportunities

3. **Comprehensive Company Profiles:**
   - Up-to-date company information
   - Key people and decision makers
   - Recent strategic moves
   - Market position and competitive landscape

4. **Investment Decision Support:**
   - Market signals and trends
   - Competitive analysis
   - Risk assessment based on news sentiment
   - Opportunity identification

## 🚀 **Next Steps**

### **Immediate Actions:**
1. **Set up API keys** for news and web research
2. **Test the functions** with your existing entities
3. **Integrate with frontend** to display news and research data
4. **Set up automated research** for key entities

### **Advanced Features:**
1. **Automated Research Scheduling** - Daily/weekly research updates
2. **Alert System** - Notifications for significant news or market changes
3. **Trend Analysis** - Long-term sentiment and market trend tracking
4. **Competitive Monitoring** - Automated competitor intelligence gathering

## 💡 **Best Practices**

1. **Rate Limiting**: Respect API rate limits to avoid service interruptions
2. **Data Freshness**: Schedule regular research updates for active entities
3. **Sentiment Analysis**: Use sentiment data to inform relationship strategies
4. **Competitive Intelligence**: Monitor competitors for market opportunities
5. **News Monitoring**: Set up alerts for significant news mentions

## 🎉 **Success Metrics**

- **News Coverage**: Track news mentions and sentiment over time
- **Market Intelligence**: Monitor market signals and trends
- **Relationship Insights**: Use social media data for warm introductions
- **Competitive Advantage**: Stay ahead with real-time competitive intelligence

The web research integration transforms your intelligence platform from static data to dynamic, real-time market intelligence! 🚀
