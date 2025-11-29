-- Web Research and News Integration Schema
-- Supports news searches, web research, market data, and social media analysis

-- Web Research Table
CREATE TABLE IF NOT EXISTS web_research (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    research_data JSONB NOT NULL,
    sources_used TEXT[] DEFAULT '{}',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(entity_type, entity_id)
);

-- News Mentions Table
CREATE TABLE IF NOT EXISTS news_mentions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    source TEXT NOT NULL,
    published_date TIMESTAMP WITH TIME ZONE NOT NULL,
    sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
    relevance_score DECIMAL(3,2) DEFAULT 0.5,
    summary TEXT,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Market Signals Table
CREATE TABLE IF NOT EXISTS market_signals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    signal_type TEXT NOT NULL, -- 'stock_price', 'funding', 'acquisition', 'partnership'
    signal_data JSONB NOT NULL,
    signal_date TIMESTAMP WITH TIME ZONE NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 0.5,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Social Media Mentions Table
CREATE TABLE IF NOT EXISTS social_mentions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    platform TEXT NOT NULL, -- 'twitter', 'linkedin', 'facebook', 'instagram'
    content TEXT NOT NULL,
    url TEXT,
    sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
    engagement_score INTEGER DEFAULT 0,
    author TEXT,
    published_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Competitive Intelligence Table
CREATE TABLE IF NOT EXISTS competitive_intelligence (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    competitor_name TEXT NOT NULL,
    competitor_type TEXT, -- 'direct', 'indirect', 'potential'
    competitive_analysis JSONB,
    market_position TEXT,
    strengths TEXT[],
    weaknesses TEXT[],
    opportunities TEXT[],
    threats TEXT[],
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Research Sources Configuration
CREATE TABLE IF NOT EXISTS research_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_name TEXT UNIQUE NOT NULL,
    source_type TEXT NOT NULL, -- 'news', 'social', 'market', 'web'
    api_endpoint TEXT,
    api_key_required BOOLEAN DEFAULT false,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT true,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default research sources
INSERT INTO research_sources (source_name, source_type, api_endpoint, api_key_required, rate_limit_per_hour) VALUES
('NewsAPI', 'news', 'https://newsapi.org/v2/everything', true, 1000),
('Google Search', 'web', 'https://www.googleapis.com/customsearch/v1', true, 100),
('Alpha Vantage', 'market', 'https://www.alphavantage.co/query', true, 5),
('Twitter API', 'social', 'https://api.twitter.com/2/tweets/search/recent', true, 300),
('LinkedIn API', 'social', 'https://api.linkedin.com/v2', true, 100),
('Reddit API', 'social', 'https://www.reddit.com/api/v1', true, 60)
ON CONFLICT (source_name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_web_research_entity ON web_research(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_web_research_last_updated ON web_research(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_news_mentions_entity ON news_mentions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_news_mentions_published_date ON news_mentions(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_mentions_sentiment ON news_mentions(sentiment);
CREATE INDEX IF NOT EXISTS idx_news_mentions_relevance_score ON news_mentions(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_market_signals_entity ON market_signals(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_market_signals_signal_date ON market_signals(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_signals_signal_type ON market_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_social_mentions_entity ON social_mentions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_social_mentions_platform ON social_mentions(platform);
CREATE INDEX IF NOT EXISTS idx_social_mentions_sentiment ON social_mentions(sentiment);
CREATE INDEX IF NOT EXISTS idx_social_mentions_engagement ON social_mentions(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_competitive_intelligence_entity ON competitive_intelligence(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_competitive_intelligence_competitor ON competitive_intelligence(competitor_name);

-- RLS Policies
ALTER TABLE web_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;

-- Web Research Policies
CREATE POLICY "Web research is viewable by authenticated users" ON web_research
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Web research is insertable by service role" ON web_research
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Web research is updatable by service role" ON web_research
    FOR UPDATE USING (auth.role() = 'service_role');

-- News Mentions Policies
CREATE POLICY "News mentions are viewable by authenticated users" ON news_mentions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "News mentions are insertable by service role" ON news_mentions
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Market Signals Policies
CREATE POLICY "Market signals are viewable by authenticated users" ON market_signals
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Market signals are insertable by service role" ON market_signals
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Social Mentions Policies
CREATE POLICY "Social mentions are viewable by authenticated users" ON social_mentions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Social mentions are insertable by service role" ON social_mentions
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Competitive Intelligence Policies
CREATE POLICY "Competitive intelligence is viewable by authenticated users" ON competitive_intelligence
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Competitive intelligence is insertable by service role" ON competitive_intelligence
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Research Sources Policies
CREATE POLICY "Research sources are viewable by authenticated users" ON research_sources
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Research sources are manageable by service role" ON research_sources
    FOR ALL USING (auth.role() = 'service_role');

-- Functions for web research
CREATE OR REPLACE FUNCTION get_entity_news(
    p_entity_type TEXT,
    p_entity_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    title TEXT,
    url TEXT,
    source TEXT,
    published_date TIMESTAMP WITH TIME ZONE,
    sentiment TEXT,
    relevance_score DECIMAL(3,2),
    summary TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        nm.title,
        nm.url,
        nm.source,
        nm.published_date,
        nm.sentiment,
        nm.relevance_score,
        nm.summary
    FROM news_mentions nm
    WHERE nm.entity_type = p_entity_type
    AND nm.entity_id = p_entity_id
    ORDER BY nm.published_date DESC, nm.relevance_score DESC
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION get_entity_social_mentions(
    p_entity_type TEXT,
    p_entity_id UUID,
    p_platform TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    platform TEXT,
    content TEXT,
    url TEXT,
    sentiment TEXT,
    engagement_score INTEGER,
    author TEXT,
    published_date TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sm.platform,
        sm.content,
        sm.url,
        sm.sentiment,
        sm.engagement_score,
        sm.author,
        sm.published_date
    FROM social_mentions sm
    WHERE sm.entity_type = p_entity_type
    AND sm.entity_id = p_entity_id
    AND (p_platform IS NULL OR sm.platform = p_platform)
    ORDER BY sm.published_date DESC, sm.engagement_score DESC
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION get_entity_market_signals(
    p_entity_type TEXT,
    p_entity_id UUID,
    p_signal_type TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    signal_type TEXT,
    signal_data JSONB,
    signal_date TIMESTAMP WITH TIME ZONE,
    confidence_score DECIMAL(3,2),
    source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ms.signal_type,
        ms.signal_data,
        ms.signal_date,
        ms.confidence_score,
        ms.source
    FROM market_signals ms
    WHERE ms.entity_type = p_entity_type
    AND ms.entity_id = p_entity_id
    AND (p_signal_type IS NULL OR ms.signal_type = p_signal_type)
    ORDER BY ms.signal_date DESC
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION get_entity_competitive_landscape(
    p_entity_type TEXT,
    p_entity_id UUID
)
RETURNS TABLE(
    competitor_name TEXT,
    competitor_type TEXT,
    market_position TEXT,
    strengths TEXT[],
    weaknesses TEXT[],
    opportunities TEXT[],
    threats TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ci.competitor_name,
        ci.competitor_type,
        ci.market_position,
        ci.strengths,
        ci.weaknesses,
        ci.opportunities,
        ci.threats
    FROM competitive_intelligence ci
    WHERE ci.entity_type = p_entity_type
    AND ci.entity_id = p_entity_id
    ORDER BY ci.competitor_name;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE web_research IS 'Stores comprehensive web research data including news, social media, market signals, and competitive intelligence';
COMMENT ON TABLE news_mentions IS 'Stores news articles and mentions related to entities with sentiment analysis and relevance scoring';
COMMENT ON TABLE market_signals IS 'Stores market signals including stock prices, funding announcements, acquisitions, and partnerships';
COMMENT ON TABLE social_mentions IS 'Stores social media mentions across platforms with sentiment analysis and engagement metrics';
COMMENT ON TABLE competitive_intelligence IS 'Stores competitive analysis including competitors, market position, and SWOT analysis';
COMMENT ON TABLE research_sources IS 'Configuration table for external research APIs and data sources';
