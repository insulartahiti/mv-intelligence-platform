-- Multi-Entity Intelligence Enrichment Schema
-- Supports different entity types with specialized data structures

-- Contact Intelligence Table
CREATE TABLE IF NOT EXISTS contact_intelligence (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    enrichment_data JSONB NOT NULL,
    linkedin_data JSONB,
    influence_score DECIMAL(3,2) DEFAULT 0.5,
    network_connections TEXT[],
    communication_preferences TEXT[],
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(contact_id)
);

-- Deal Intelligence Table (using deal_memos instead of deals)
CREATE TABLE IF NOT EXISTS deal_intelligence (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    deal_id UUID REFERENCES deal_memos(id) ON DELETE CASCADE,
    enrichment_data JSONB NOT NULL,
    deal_stage TEXT,
    valuation TEXT,
    closing_probability DECIMAL(3,2),
    key_stakeholders TEXT[],
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(deal_id)
);

-- Enhanced Intelligence Overlays with Entity Type Support
ALTER TABLE intelligence_overlays 
ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'company',
ADD COLUMN IF NOT EXISTS enrichment_sources TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS linkedin_data JSONB,
ADD COLUMN IF NOT EXISTS portfolio_data JSONB,
ADD COLUMN IF NOT EXISTS funding_data JSONB,
ADD COLUMN IF NOT EXISTS market_signals JSONB;

-- Entity Type Enum
CREATE TYPE entity_type_enum AS ENUM (
    'fund',
    'portfolio_company', 
    'startup',
    'contact',
    'deal',
    'company'
);

-- Update intelligence_overlays to support entity types
-- First, add the new column with the enum type
ALTER TABLE intelligence_overlays
ADD COLUMN IF NOT EXISTS entity_type_new entity_type_enum DEFAULT 'company';

-- Copy data from old column to new column (assuming existing data is 'company')
UPDATE intelligence_overlays 
SET entity_type_new = 'company' 
WHERE entity_type_new IS NULL;

-- Drop the old column and rename the new one
ALTER TABLE intelligence_overlays DROP COLUMN IF EXISTS entity_type;
ALTER TABLE intelligence_overlays RENAME COLUMN entity_type_new TO entity_type;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contact_intelligence_contact_id ON contact_intelligence(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_intelligence_influence_score ON contact_intelligence(influence_score);
CREATE INDEX IF NOT EXISTS idx_deal_intelligence_deal_id ON deal_intelligence(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_intelligence_stage ON deal_intelligence(deal_stage);
CREATE INDEX IF NOT EXISTS idx_intelligence_overlays_entity_type ON intelligence_overlays(entity_type);
CREATE INDEX IF NOT EXISTS idx_intelligence_overlays_enrichment_sources ON intelligence_overlays USING GIN(enrichment_sources);

-- RLS Policies
ALTER TABLE contact_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_intelligence ENABLE ROW LEVEL SECURITY;

-- Contact Intelligence Policies
CREATE POLICY "Contact intelligence is viewable by authenticated users" ON contact_intelligence
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Contact intelligence is insertable by service role" ON contact_intelligence
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Contact intelligence is updatable by service role" ON contact_intelligence
    FOR UPDATE USING (auth.role() = 'service_role');

-- Deal Intelligence Policies
CREATE POLICY "Deal intelligence is viewable by authenticated users" ON deal_intelligence
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Deal intelligence is insertable by service role" ON deal_intelligence
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Deal intelligence is updatable by service role" ON deal_intelligence
    FOR UPDATE USING (auth.role() = 'service_role');

-- Enhanced Intelligence Overlays Policies
CREATE POLICY "Enhanced intelligence overlays are viewable by authenticated users" ON intelligence_overlays
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enhanced intelligence overlays are insertable by service role" ON intelligence_overlays
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Enhanced intelligence overlays are updatable by service role" ON intelligence_overlays
    FOR UPDATE USING (auth.role() = 'service_role');

-- Functions for intelligent enrichment
CREATE OR REPLACE FUNCTION get_entity_enrichment(
    p_entity_type entity_type_enum,
    p_entity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    CASE p_entity_type
        WHEN 'fund', 'portfolio_company', 'startup', 'company' THEN
            SELECT enrichment_data INTO result
            FROM intelligence_overlays
            WHERE company_id = p_entity_id
            ORDER BY last_updated DESC
            LIMIT 1;
        WHEN 'contact' THEN
            SELECT enrichment_data INTO result
            FROM contact_intelligence
            WHERE contact_id = p_entity_id
            ORDER BY last_updated DESC
            LIMIT 1;
        WHEN 'deal' THEN
            SELECT enrichment_data INTO result
            FROM deal_intelligence
            WHERE deal_id = p_entity_id
            ORDER BY last_updated DESC
            LIMIT 1;
    END CASE;
    
    RETURN COALESCE(result, '{}'::JSONB);
END;
$$;

-- Function to get portfolio companies for a fund
CREATE OR REPLACE FUNCTION get_fund_portfolio(
    p_fund_id UUID
)
RETURNS TABLE(
    company_id UUID,
    company_name TEXT,
    investment_stage TEXT,
    investment_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- This would query portfolio companies from Affinity or other sources
    -- For now, return empty result
    RETURN;
END;
$$;

-- Function to get contact network connections
CREATE OR REPLACE FUNCTION get_contact_network(
    p_contact_id UUID
)
RETURNS TABLE(
    connection_id UUID,
    connection_name TEXT,
    connection_title TEXT,
    connection_company TEXT,
    relationship_strength DECIMAL(3,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- This would query LinkedIn or other network data
    -- For now, return empty result
    RETURN;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE contact_intelligence IS 'Stores enriched intelligence data for contacts including LinkedIn data and network connections';
COMMENT ON TABLE deal_intelligence IS 'Stores enriched intelligence data for deals including valuation, stakeholders, and closing probability';
COMMENT ON COLUMN intelligence_overlays.entity_type IS 'Type of entity: fund, portfolio_company, startup, contact, deal, or company';
COMMENT ON COLUMN intelligence_overlays.enrichment_sources IS 'Array of data sources used for enrichment: affinity, linkedin, ai, etc.';
COMMENT ON COLUMN intelligence_overlays.linkedin_data IS 'LinkedIn-specific data and insights';
COMMENT ON COLUMN intelligence_overlays.portfolio_data IS 'Portfolio-specific data for funds and portfolio companies';
COMMENT ON COLUMN intelligence_overlays.funding_data IS 'Funding history and financial data';
COMMENT ON COLUMN intelligence_overlays.market_signals IS 'Market signals and news data';
